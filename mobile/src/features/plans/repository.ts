import { asc, eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { suggestedTarget } from '@/features/progress/repository';

import { type DraftItem, newItemKey, type PlanDraft, validateDraft } from './draft';

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
    sport: plan.sport,
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

  return db.transaction((tx) => {
    const values = {
      sport: draft.sport,
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
  const draft = loadPlanDraft(db, id);
  return {
    ...draft,
    id: undefined,
    title: source.isTemplate ? source.title : `${source.title} (kopia)`,
    sourceTemplateId: source.isTemplate ? source.id : source.sourceTemplateId,
    // Ciężary w szablonie są katalogowe — dla kogoś, kto te ćwiczenia już robił, znaczą mniej
    // niż jego własny ostatni trening. W kopii własnego planu liczby są już jego, więc zostają.
    items: source.isTemplate ? draft.items.map((item) => fromHistory(db, item)) : draft.items,
  };
}

/**
 * Pozycja szablonu uzupełniona historią. Szablon mówi, ile serii i powtórzeń — to jego zamysł
 * i zostaje. Podmieniamy ciężar, bo tego szablon wiedzieć nie może, ale tylko gdy ostatni trening
 * szedł na tyle samo powtórzeń: przy innym celu ten sam ciężar znaczy co innego, więc zostaje
 * podpowiedź zamiast podmiany. Przy ćwiczeniu na czas podmieniamy czas, bo nic innego tam nie ma.
 */
function fromHistory(db: SyncDb, item: DraftItem): DraftItem {
  const target = suggestedTarget(db, item.exerciseId, item.trackingType);
  if (target === null) return item;
  if (item.trackingType === 'TIME') {
    return { ...item, targetDurationSeconds: target.targetDurationSeconds, hint: target.reason };
  }
  const sameReps = target.targetReps !== null && target.targetReps === item.targetReps;
  return {
    ...item,
    targetWeight: sameReps ? target.targetWeight : item.targetWeight,
    hint: sameReps
      ? target.reason
      : `${target.reason} Szablon zakłada inną liczbę powtórzeń, więc ciężar dobierz sam.`,
  };
}

/** Kopiuje plan lub szablon do planów użytkownika. Zwraca id nowego planu. */
export function copyPlan(db: SyncDb, id: number): number {
  return savePlan(db, draftFromPlan(db, id));
}

/**
 * Usuwa plan albo szablon. Zaplanowane terminy znikają razem z nim, historia treningów zostaje.
 * Wbudowany szablon też wolno usunąć — seed pamięta, że go już wgrał, więc nie wróci.
 */
export function deletePlan(db: SyncDb, id: number): void {
  getPlan(db, id);
  db.delete(schema.workoutPlans).where(eq(schema.workoutPlans.id, id)).run();
}
