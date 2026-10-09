import { asc, eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

import {
  type EnduranceDraft,
  newSegmentKey,
  type SegmentDraft,
  validateEnduranceDraft,
} from './draft';

/**
 * Zapis i odczyt planów wytrzymałościowych. Odcinki zapisujemy dwuprzebiegowo: najpierw grupy,
 * potem ich wnętrze — dopiero wtedy znamy `parent_id`, którego przed zapisem jeszcze nie ma.
 */

function insertSegments(tx: SyncDb, planId: number, segments: SegmentDraft[]): void {
  const idByKey = new Map<string, number>();
  const ordered = [...segments.filter((s) => s.parentKey === null), ...segments.filter((s) => s.parentKey !== null)];

  let orderIndex = 0;
  for (const segment of ordered) {
    const row = tx
      .insert(schema.planSegments)
      .values({
        planId,
        parentId: segment.parentKey === null ? null : (idByKey.get(segment.parentKey) ?? null),
        orderIndex: orderIndex++,
        kind: segment.kind,
        repeatCount: segment.repeatCount,
        durationType: segment.durationType,
        distanceMeters: segment.distanceMeters,
        durationSeconds: segment.durationSeconds,
        targetType: segment.targetType,
        targetLow: segment.targetLow,
        targetHigh: segment.targetHigh,
        stroke: segment.stroke,
        equipment: segment.equipment,
        drill: segment.drill,
        notes: segment.notes,
      })
      .returning({ id: schema.planSegments.id })
      .get();
    idByKey.set(segment.key, row.id);
  }
}

export function saveEndurancePlan(db: SyncDb, draft: EnduranceDraft): number {
  validateEnduranceDraft(draft);
  if (draft.id !== undefined) {
    const plan = db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, draft.id)).get();
    if (!plan) throw new Error(`Plan ${draft.id} nie istnieje`);
  }

  return db.transaction((tx) => {
    const values = {
      sport: draft.sport,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      sourceTemplateId: null,
    };
    let planId: number;
    if (draft.id === undefined) {
      planId = tx.insert(schema.workoutPlans).values(values).returning({ id: schema.workoutPlans.id }).get().id;
    } else {
      planId = draft.id;
      tx.update(schema.workoutPlans)
        .set({ ...values, updatedAt: new Date().toISOString() })
        .where(eq(schema.workoutPlans.id, planId))
        .run();
      // Odcinki nie są referencjonowane spoza planu — zastępujemy je w całości.
      tx.delete(schema.planSegments).where(eq(schema.planSegments.planId, planId)).run();
    }
    insertSegments(tx as unknown as SyncDb, planId, draft.segments);
    return planId;
  });
}

export function loadEnduranceDraft(db: SyncDb, planId: number): EnduranceDraft {
  const plan = db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).get();
  if (!plan) throw new Error(`Plan ${planId} nie istnieje`);

  const rows = listPlanSegments(db, planId);
  const keyById = new Map<number, string>();
  for (const row of rows) keyById.set(row.id, newSegmentKey());

  return {
    id: plan.id,
    sport: plan.sport,
    title: plan.title,
    description: plan.description ?? '',
    segments: rows.map((row) => ({
      key: keyById.get(row.id)!,
      parentKey: row.parentId === null ? null : (keyById.get(row.parentId) ?? null),
      kind: row.kind,
      repeatCount: row.repeatCount,
      durationType: row.durationType,
      distanceMeters: row.distanceMeters,
      durationSeconds: row.durationSeconds,
      targetType: row.targetType,
      targetLow: row.targetLow,
      targetHigh: row.targetHigh,
      stroke: row.stroke,
      equipment: row.equipment,
      drill: row.drill,
      notes: row.notes,
    })),
  };
}

export const listPlanSegments = (db: SyncDb, planId: number) =>
  db
    .select()
    .from(schema.planSegments)
    .where(eq(schema.planSegments.planId, planId))
    .orderBy(asc(schema.planSegments.orderIndex))
    .all();
