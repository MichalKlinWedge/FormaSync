/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { deletePlan } from '@/features/plans/repository';

import { createRepeatBlock, createSegment, emptyEnduranceDraft, updateSegment } from '../draft';
import {
  listPlanSegments,
  loadEnduranceDraft,
  saveEndurancePlan,
} from '../repository';

function intervalDraft() {
  const [group, work, recovery] = createRepeatBlock();
  return {
    ...emptyEnduranceDraft('RUNNING'),
    title: 'Interwały 5×400',
    description: 'Wtorkowy akcent',
    segments: updateSegment([createSegment('WARMUP'), group, work, recovery], group.key, {
      repeatCount: 5,
    }),
  };
}

describe('saveEndurancePlan', () => {
  it('zapisuje odcinki i wiąże wnętrze grupy z grupą', () => {
    const db = createTestDb({ seed: true });
    const planId = saveEndurancePlan(db, intervalDraft());

    const rows = listPlanSegments(db, planId);
    const group = rows.find((row) => row.kind === 'REPEAT')!;
    const inside = rows.filter((row) => row.parentId === group.id);

    expect(rows).toHaveLength(4);
    expect(group.repeatCount).toBe(5);
    expect(inside.map((row) => row.kind).sort()).toEqual(['RECOVERY', 'WORK']);
    expect(rows.find((row) => row.kind === 'WARMUP')?.parentId).toBeNull();
  });

  it('odczyt zwraca ten sam plan, z zachowaną przynależnością do grupy', () => {
    const db = createTestDb({ seed: true });
    const planId = saveEndurancePlan(db, intervalDraft());

    const draft = loadEnduranceDraft(db, planId);
    const group = draft.segments.find((segment) => segment.kind === 'REPEAT')!;

    expect(draft.title).toBe('Interwały 5×400');
    expect(draft.sport).toBe('RUNNING');
    expect(draft.segments.filter((segment) => segment.parentKey === group.key)).toHaveLength(2);
  });

  it('ponowny zapis zastępuje odcinki, a nie dokłada ich obok', () => {
    const db = createTestDb({ seed: true });
    const planId = saveEndurancePlan(db, intervalDraft());

    const draft = loadEnduranceDraft(db, planId);
    saveEndurancePlan(db, { ...draft, segments: [createSegment('WARMUP')] });

    expect(listPlanSegments(db, planId)).toHaveLength(1);
  });

  it('usunięcie planu zabiera jego odcinki', () => {
    const db = createTestDb({ seed: true });
    const planId = saveEndurancePlan(db, intervalDraft());

    deletePlan(db, planId);

    expect(listPlanSegments(db, planId)).toEqual([]);
  });
});

describe('szablony wytrzymałościowe', () => {
  it('dają się przerobić i zostają szablonami', () => {
    const db = createTestDb({ seed: true });
    const template = db
      .select()
      .from(schema.workoutPlans)
      .where(eq(schema.workoutPlans.title, 'Interwały 6×400 m'))
      .get()!;

    const draft = loadEnduranceDraft(db, template.id);
    saveEndurancePlan(db, { ...draft, title: 'Interwały 5×400 m' });

    const saved = db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, template.id)).get()!;
    expect(saved.title).toBe('Interwały 5×400 m');
    expect(saved.isTemplate).toBe(true);
  });
});
