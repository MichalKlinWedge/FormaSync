import { asc, eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

import { newItemKey, type PlanDraft, validateDraft } from './draft';

export class TemplateReadOnlyError extends Error {
  constructor() {
    super('Szablonów nie można modyfikować — skopiuj szablon do swoich planów.');
  }
}

function getPlan(db: SyncDb, id: number) {
  const plan = db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, id)).get();
  if (!plan) throw new Error(`Plan ${id} nie istnieje`);
  return plan;
}

/** Wczytuje plan jako wersję roboczą do kreatora. */
export function loadPlanDraft(db: SyncDb, id: number): PlanDraft {
  const plan = getPlan(db, id);
  const items = db
    .select({ pe: schema.planExercises, exercise: schema.exercises })
    .from(schema.planExercises)
    .innerJoin(schema.exercises, eq(schema.planExercises.exerciseId, schema.exercises.id))
    .where(eq(schema.planExercises.planId, id))
    .orderBy(asc(schema.planExercises.orderIndex))
    .all();
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description ?? '',
    sourceTemplateId: plan.sourceTemplateId,
    items: items.map(({ pe, exercise }) => ({
      key: newItemKey(),
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      trackingType: exercise.trackingType,
      targetSets: pe.targetSets,
      targetReps: pe.targetReps,
      targetWeight: pe.targetWeight,
      targetDurationSeconds: pe.targetDurationSeconds,
      restDurationSeconds: pe.restDurationSeconds,
      notes: pe.notes,
    })),
  };
}

/** Zapisuje plan użytkownika (nowy lub istniejący). Zwraca id planu. */
export function savePlan(db: SyncDb, draft: PlanDraft): number {
  validateDraft(draft);
  if (draft.id !== undefined && getPlan(db, draft.id).isTemplate) throw new TemplateReadOnlyError();

  return db.transaction((tx) => {
    const values = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      sourceTemplateId: draft.sourceTemplateId,
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
      // Pozycje planu nie są referencjonowane z innych tabel — zastępujemy je w całości.
      tx.delete(schema.planExercises).where(eq(schema.planExercises.planId, planId)).run();
    }
    tx.insert(schema.planExercises)
      .values(
        draft.items.map((item, orderIndex) => ({
          planId,
          exerciseId: item.exerciseId,
          orderIndex,
          targetSets: item.targetSets,
          targetReps: item.trackingType === 'REPS' ? item.targetReps : null,
          targetWeight: item.targetWeight,
          targetDurationSeconds: item.trackingType === 'TIME' ? item.targetDurationSeconds : null,
          restDurationSeconds: item.restDurationSeconds,
          notes: item.notes?.trim() || null,
        })),
      )
      .run();
    return planId;
  });
}

/**
 * Wersja robocza kopii planu lub szablonu (jeszcze niezapisana). Kopia szablonu zachowuje nazwę
 * i wskazuje źródło, kopia własnego planu dostaje dopisek „(kopia)”.
 */
export function draftFromPlan(db: SyncDb, id: number): PlanDraft {
  const source = getPlan(db, id);
  return {
    ...loadPlanDraft(db, id),
    id: undefined,
    title: source.isTemplate ? source.title : `${source.title} (kopia)`,
    sourceTemplateId: source.isTemplate ? source.id : source.sourceTemplateId,
  };
}

/** Kopiuje plan lub szablon do planów użytkownika. Zwraca id nowego planu. */
export function copyPlan(db: SyncDb, id: number): number {
  return savePlan(db, draftFromPlan(db, id));
}

/** Usuwa plan użytkownika. Zaplanowane terminy znikają razem z nim, historia treningów zostaje. */
export function deletePlan(db: SyncDb, id: number): void {
  if (getPlan(db, id).isTemplate) throw new TemplateReadOnlyError();
  db.delete(schema.workoutPlans).where(eq(schema.workoutPlans.id, id)).run();
}
