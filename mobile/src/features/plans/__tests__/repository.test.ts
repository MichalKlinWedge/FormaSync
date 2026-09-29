/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { and, eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';

import { updateItem } from '../draft';
import { copyPlan, deletePlan, loadPlanDraft, savePlan, TemplateReadOnlyError } from '../repository';

function setup() {
  const db = createTestDb({ seed: true });
  const ppl = db
    .select()
    .from(schema.workoutPlans)
    .where(and(eq(schema.workoutPlans.isTemplate, true), eq(schema.workoutPlans.title, 'PPL — Push (pchanie)')))
    .get()!;
  return { db, ppl };
}

describe('kopiowanie szablonu (kryterium odbioru etapu 3)', () => {
  it('tworzy własny plan z szablonu PPL, który można zmodyfikować bez naruszania szablonu', () => {
    const { db, ppl } = setup();
    const templateBefore = loadPlanDraft(db, ppl.id);

    const copyId = copyPlan(db, ppl.id);
    const copy = loadPlanDraft(db, copyId);
    expect(copy.title).toBe(ppl.title);
    expect(copy.sourceTemplateId).toBe(ppl.id);
    expect(copy.items.map((i) => i.exerciseId)).toEqual(templateBefore.items.map((i) => i.exerciseId));
    expect(db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, copyId)).get()?.isTemplate).toBe(
      false,
    );

    // Modyfikacja kopii: zmiana ciężaru, usunięcie ostatniego ćwiczenia, odwrócenie kolejności.
    const edited = updateItem(copy, copy.items[0].key, { targetWeight: 70 });
    edited.items = edited.items.slice(0, -1).reverse();
    savePlan(db, { ...edited, title: 'Mój Push' });

    const saved = loadPlanDraft(db, copyId);
    expect(saved.title).toBe('Mój Push');
    expect(saved.items).toHaveLength(templateBefore.items.length - 1);
    expect(saved.items.at(-1)?.targetWeight).toBe(70);

    // Szablon bez zmian.
    const templateAfter = loadPlanDraft(db, ppl.id);
    expect(templateAfter.items.map(({ key: _, ...rest }) => rest)).toEqual(
      templateBefore.items.map(({ key: _, ...rest }) => rest),
    );
  });

  it('kopia własnego planu dostaje dopisek „(kopia)”', () => {
    const { db, ppl } = setup();
    const first = copyPlan(db, ppl.id);
    const second = copyPlan(db, first);
    expect(loadPlanDraft(db, second).title).toBe(`${ppl.title} (kopia)`);
  });
});

describe('ochrona szablonów', () => {
  it('nie pozwala edytować ani usuwać szablonu', () => {
    const { db, ppl } = setup();
    const draft = loadPlanDraft(db, ppl.id);
    expect(() => savePlan(db, { ...draft, title: 'Zmieniony' })).toThrow(TemplateReadOnlyError);
    expect(() => deletePlan(db, ppl.id)).toThrow(TemplateReadOnlyError);
  });
});

describe('savePlan', () => {
  it('zapisuje tylko pola właściwe dla typu rejestracji ćwiczenia', () => {
    const { db } = setup();
    const plank = db.select().from(schema.exercises).where(eq(schema.exercises.name, 'Plank (deska)')).get()!;
    const id = savePlan(db, {
      title: 'Core',
      description: '',
      sourceTemplateId: null,
      items: [
        {
          key: 'a',
          exerciseId: plank.id,
          exerciseName: plank.name,
          trackingType: 'TIME',
          targetSets: 3,
          targetReps: 12, // nieistotne dla ćwiczenia na czas
          targetWeight: null,
          targetDurationSeconds: 40,
          restDurationSeconds: 60,
          notes: '  ',
        },
      ],
    });
    const row = db.select().from(schema.planExercises).where(eq(schema.planExercises.planId, id)).get();
    expect(row).toMatchObject({ targetReps: null, targetDurationSeconds: 40, notes: null, orderIndex: 0 });
    expect(db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, id)).get()?.description).toBeNull();
  });
});

describe('deletePlan', () => {
  it('usuwa plan z pozycjami i terminami, zachowując historię treningów', () => {
    const { db, ppl } = setup();
    const id = copyPlan(db, ppl.id);
    const scheduled = db
      .insert(schema.scheduledWorkouts)
      .values({ planId: id, scheduledDate: '2026-10-01' })
      .returning()
      .get();
    const session = db
      .insert(schema.workoutSessions)
      .values({ planId: id, scheduledId: scheduled.id, startTime: '2026-10-01T10:00:00Z' })
      .returning()
      .get();

    deletePlan(db, id);

    expect(db.select().from(schema.planExercises).where(eq(schema.planExercises.planId, id)).all()).toEqual([]);
    expect(db.select().from(schema.scheduledWorkouts).where(eq(schema.scheduledWorkouts.planId, id)).all()).toEqual(
      [],
    );
    expect(
      db.select().from(schema.workoutSessions).where(eq(schema.workoutSessions.id, session.id)).get(),
    ).toMatchObject({ planId: null, scheduledId: null });
  });
});
