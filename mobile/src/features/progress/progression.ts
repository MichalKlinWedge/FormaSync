import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

// Sugestie korekty ciężaru na kolejny tydzień na podstawie ostatniego wykonania planu.
// Reguły są celowo zachowawcze, a każdą zmianę zatwierdza użytkownik.

/** Najmniejszy sensowny przyrost na sztandze: para talerzyków 1,25 kg. */
export const WEIGHT_STEP = 2.5;

export type SetOutcome = { reps: number | null; weightKg: number | null; rpe: number | null };

export type ExercisePerformance = {
  planExerciseId: number;
  exerciseId: number;
  exerciseName: string;
  targetSets: number;
  targetReps: number | null;
  targetWeight: number | null;
  /** Wykonane serie z ostatniej sesji. */
  sets: SetOutcome[];
};

export type ProgressionAdvice = 'INCREASE' | 'HOLD' | 'DECREASE';

export type Suggestion = {
  planExerciseId: number;
  exerciseId: number;
  exerciseName: string;
  advice: ProgressionAdvice;
  currentWeight: number;
  suggestedWeight: number;
  reason: string;
};

function roundToStep(value: number): number {
  return Math.round(value / WEIGHT_STEP) * WEIGHT_STEP;
}

/** Zmiana o zadany procent, zawsze o co najmniej jeden krok i nigdy poniżej jednego kroku. */
function applyPercent(current: number, percent: number): number {
  let next = roundToStep(current * (1 + percent));
  if (percent > 0 && next <= current) next = current + WEIGHT_STEP;
  if (percent < 0 && next >= current) next = current - WEIGHT_STEP;
  return Math.max(next, WEIGHT_STEP);
}

const average = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

const formatRpe = (rpe: number) => (Number.isInteger(rpe) ? String(rpe) : rpe.toFixed(1).replace('.', ','));

/**
 * Reguła progresji:
 * — komplet serii i powtórzeń przy RPE do 7 (lub bez oceny) → +5%,
 * — to samo przy RPE 8 → +2,5% (ostrożny krok),
 * — RPE 9–10 albo niepełne powtórzenia → utrzymaj ciężar,
 * — mniej niż połowa zaplanowanej pracy → −5%.
 *
 * Zwraca null dla ćwiczeń, których nie da się ocenić: bez ciężaru docelowego,
 * bez celu powtórzeń (ćwiczenia na czas) albo bez ani jednej wykonanej serii.
 */
export function suggestProgression(performance: ExercisePerformance): Suggestion | null {
  const { targetWeight, targetReps, targetSets, sets } = performance;
  if (targetWeight === null || targetWeight <= 0 || targetReps === null || targetReps <= 0) return null;
  if (sets.length === 0) return null;

  const base = {
    planExerciseId: performance.planExerciseId,
    exerciseId: performance.exerciseId,
    exerciseName: performance.exerciseName,
    currentWeight: targetWeight,
  };

  const completedReps = sets.map((set) => set.reps ?? 0);
  const totalPlanned = targetSets * targetReps;
  const totalDone = completedReps.reduce((sum, reps) => sum + reps, 0);
  const allSetsDone = sets.length >= targetSets;
  const allRepsMet = completedReps.every((reps) => reps >= targetReps);
  const avgRpe = average(sets.map((set) => set.rpe).filter((rpe): rpe is number => rpe !== null));

  if (totalDone * 2 < totalPlanned) {
    const suggested = applyPercent(targetWeight, -0.05);
    return {
      ...base,
      advice: 'DECREASE',
      suggestedWeight: suggested,
      reason: `Wykonano ${totalDone} z ${totalPlanned} powtórzeń — ciężar był za duży.`,
    };
  }

  if (!allSetsDone || !allRepsMet) {
    return {
      ...base,
      advice: 'HOLD',
      suggestedWeight: targetWeight,
      reason: allSetsDone
        ? `Nie we wszystkich seriach wyszło po ${targetReps} powt. — powtórz ten ciężar.`
        : `Ukończono ${sets.length} z ${targetSets} serii — powtórz ten ciężar.`,
    };
  }

  if (avgRpe !== null && avgRpe >= 9) {
    return {
      ...base,
      advice: 'HOLD',
      suggestedWeight: targetWeight,
      reason: `Komplet serii, ale przy RPE ${formatRpe(avgRpe)} — utrwal ten ciężar.`,
    };
  }

  const percent = avgRpe !== null && avgRpe > 7 ? 0.025 : 0.05;
  const suggested = applyPercent(targetWeight, percent);
  return {
    ...base,
    advice: 'INCREASE',
    suggestedWeight: suggested,
    reason:
      avgRpe === null
        ? `Komplet ${targetSets} × ${targetReps} powt. — czas na więcej.`
        : `Komplet ${targetSets} × ${targetReps} powt. przy RPE ${formatRpe(avgRpe)} — czas na więcej.`,
  };
}

export type ProgressionProposal = {
  planId: number;
  planTitle: string;
  /** Data ostatniego wykonania planu (klucz dnia). */
  basedOn: string;
  suggestions: Suggestion[];
};

/**
 * Zbiera wykonanie planu z ostatniej ukończonej sesji i przekłada je na sugestie.
 * Zwraca null, gdy plan jest szablonem albo nie był jeszcze wykonany.
 */
export function proposeProgression(db: SyncDb, planId: number): ProgressionProposal | null {
  const plan = db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).get();
  if (!plan || plan.isTemplate) return null;

  const session = db
    .select()
    .from(schema.workoutSessions)
    .where(and(eq(schema.workoutSessions.planId, planId), eq(schema.workoutSessions.status, 'COMPLETED')))
    .orderBy(desc(schema.workoutSessions.startTime))
    .get();
  if (!session) return null;

  const planItems = db
    .select()
    .from(schema.planExercises)
    .where(eq(schema.planExercises.planId, planId))
    .orderBy(asc(schema.planExercises.orderIndex))
    .all();
  const sessionItems = db
    .select({ se: schema.sessionExercises, name: schema.exercises.name })
    .from(schema.sessionExercises)
    .innerJoin(schema.exercises, eq(schema.sessionExercises.exerciseId, schema.exercises.id))
    .where(eq(schema.sessionExercises.sessionId, session.id))
    .orderBy(asc(schema.sessionExercises.orderIndex))
    .all();
  const sets = db
    .select()
    .from(schema.loggedSets)
    .where(and(eq(schema.loggedSets.sessionId, session.id), isNotNull(schema.loggedSets.completedAt)))
    .orderBy(asc(schema.loggedSets.setNumber))
    .all();

  // To samo ćwiczenie może wystąpić w planie kilka razy — dopasowujemy je po kolei.
  const queues = new Map<number, (typeof planItems)[number][]>();
  for (const item of planItems) {
    queues.set(item.exerciseId, [...(queues.get(item.exerciseId) ?? []), item]);
  }

  const suggestions: Suggestion[] = [];
  for (const { se, name } of sessionItems) {
    const planItem = queues.get(se.exerciseId)?.shift();
    if (!planItem) continue;
    const suggestion = suggestProgression({
      planExerciseId: planItem.id,
      exerciseId: se.exerciseId,
      exerciseName: name,
      targetSets: planItem.targetSets,
      targetReps: planItem.targetReps,
      targetWeight: planItem.targetWeight,
      sets: sets
        .filter((set) => set.sessionExerciseId === se.id)
        .map((set) => ({ reps: set.repsCompleted, weightKg: set.weightKg, rpe: set.rpe })),
    });
    if (suggestion) suggestions.push(suggestion);
  }

  return {
    planId,
    planTitle: plan.title,
    basedOn: session.startTime,
    suggestions,
  };
}

/** Zapisuje zaakceptowane ciężary w planie. */
export function applyProgression(db: SyncDb, suggestions: Suggestion[]): void {
  if (suggestions.length === 0) return;
  db.transaction((tx) => {
    for (const suggestion of suggestions) {
      tx.update(schema.planExercises)
        .set({ targetWeight: suggestion.suggestedWeight })
        .where(eq(schema.planExercises.id, suggestion.planExerciseId))
        .run();
    }
  });
}
