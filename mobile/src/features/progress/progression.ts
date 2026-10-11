import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { formatKg } from '@/lib/number';

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
  /** Ciężar z ostatniej sesji, od którego policzona jest sugestia. */
  currentWeight: number;
  /** Ciężar wpisany dziś w planie — ten zmieni się po zatwierdzeniu. */
  planWeight: number;
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

/** Cel i wykonanie — wszystko, czego potrzebuje sama reguła, bez wiedzy o planie. */
export type WorkDone = {
  targetSets: number;
  targetReps: number | null;
  targetWeight: number | null;
  sets: SetOutcome[];
};

/** Werdykt reguły: co zrobić z ciężarem i dlaczego. */
export type ProgressionCall = {
  advice: ProgressionAdvice;
  /** Ciężar, od którego liczona jest sugestia — z sesji, nie z planu. */
  currentWeight: number;
  suggestedWeight: number;
  reason: string;
};

/** Ciężary zapisanych serii od najcięższej; bez serii bez ciężaru i bez `minReps` powtórzeń. */
const workWeights = (sets: SetOutcome[], minReps: number): number[] =>
  sets
    .filter((set) => (set.reps ?? 0) >= minReps && (set.weightKg ?? 0) > 0)
    .map((set) => set.weightKg as number)
    .sort((a, b) => b - a);

/**
 * Najcięższy ciężar, na którym wyszedł komplet: tyle serii, ile zakładał cel, każda z pełną liczbą
 * powtórzeń. Serie cięższe liczą się do kompletu lżejszego — kto doszedł do 85 kg przez 80, zrobił
 * komplet trzech serii „nie lżej niż 80”, a nie trzech serii na 85. Po posortowaniu malejąco stoi
 * on więc dokładnie na pozycji `targetSets`.
 *
 * Stąd dwie rzeczy wychodzą same: komplet zrobiony ponad planem staje się podstawą progresji,
 * a pojedyncza ciężka próba poza planem — nie, bo kompletem nie jest.
 */
export function heaviestComplete(
  sets: SetOutcome[],
  targetSets: number,
  targetReps: number,
): number | null {
  const weights = workWeights(sets, targetReps);
  return weights.length < targetSets ? null : weights[targetSets - 1];
}

/**
 * Ciężar, z którym się mierzono, gdy kompletu nie było — podstawa dla „utrzymaj” i „obniż”.
 * Liczony tak samo jak komplet, tylko bez wymogu pełnych powtórzeń, a przy sesji krótszej od celu
 * bierze najlżejszą z zapisanych serii. Dzięki temu jedna ciężka próba nie podnosi podstawy ponad
 * to, co w tym treningu było pracą.
 */
function attemptedWeight(sets: SetOutcome[], targetSets: number): number | null {
  const weights = workWeights(sets, 1);
  return weights.length === 0 ? null : weights[Math.min(targetSets, weights.length) - 1];
}

/**
 * Reguła progresji:
 * — komplet serii i powtórzeń przy RPE do 7 (lub bez oceny) → +5%,
 * — to samo przy RPE 8 → +2,5% (ostrożny krok),
 * — RPE 9–10 albo niepełne powtórzenia → utrzymaj ciężar,
 * — mniej niż połowa zaplanowanej pracy → −5%.
 *
 * Procent liczy się od ciężaru z sesji, nie z planu: kto zrobił komplet na 85 kg przy planie na 80,
 * dostaje 90, a nie 85. Inaczej sugestia wlokłaby się za tym, co zawodnik już dźwiga, a plan po
 * zatwierdzeniu cofałby ciężar. Gdy serie nie mają zapisanego ciężaru, zostaje cel z planu.
 *
 * Zwraca null dla ćwiczeń, których nie da się ocenić: bez ciężaru docelowego,
 * bez celu powtórzeń (ćwiczenia na czas) albo bez ani jednej wykonanej serii.
 *
 * Reguła żyje osobno od planu, bo liczy ją też opis ćwiczenia — tam celem nie jest wpis z planu,
 * tylko to, co poszło ostatnim razem. Dwóch różnych reguł progresji w jednej aplikacji być nie może.
 */
export function decideProgression(work: WorkDone): ProgressionCall | null {
  const { targetWeight, targetReps, targetSets, sets } = work;
  if (targetWeight === null || targetWeight <= 0 || targetReps === null || targetReps <= 0) return null;
  if (sets.length === 0) return null;

  const completedReps = sets.map((set) => set.reps ?? 0);
  const totalPlanned = targetSets * targetReps;
  const totalDone = completedReps.reduce((sum, reps) => sum + reps, 0);
  const allSetsDone = sets.length >= targetSets;
  const allRepsMet = completedReps.every((reps) => reps >= targetReps);
  const avgRpe = average(sets.map((set) => set.rpe).filter((rpe): rpe is number => rpe !== null));
  const base =
    heaviestComplete(sets, targetSets, targetReps) ?? attemptedWeight(sets, targetSets) ?? targetWeight;
  // Ciężar inny niż w planie trzeba nazwać wprost, bo samo „90 kg” przy planie na 80 wygląda
  // na usterkę, a nie na wniosek z ostatniego treningu.
  const onWeight = base === targetWeight ? '' : ` na ${formatKg(base)}`;

  if (totalDone * 2 < totalPlanned) {
    return {
      advice: 'DECREASE',
      currentWeight: base,
      suggestedWeight: applyPercent(base, -0.05),
      reason: `Wykonano ${totalDone} z ${totalPlanned} powtórzeń${onWeight} — ciężar był za duży.`,
    };
  }

  if (!allSetsDone || !allRepsMet) {
    return {
      advice: 'HOLD',
      currentWeight: base,
      suggestedWeight: base,
      reason: allSetsDone
        ? `Nie we wszystkich seriach wyszło po ${targetReps} powt. — powtórz ten ciężar.`
        : `Ukończono ${sets.length} z ${targetSets} serii — powtórz ten ciężar.`,
    };
  }

  if (avgRpe !== null && avgRpe >= 9) {
    return {
      advice: 'HOLD',
      currentWeight: base,
      suggestedWeight: base,
      reason: `Komplet serii, ale przy RPE ${formatRpe(avgRpe)} — utrwal ten ciężar.`,
    };
  }

  const percent = avgRpe !== null && avgRpe > 7 ? 0.025 : 0.05;
  const rpePart = avgRpe === null ? '' : ` przy RPE ${formatRpe(avgRpe)}`;
  return {
    advice: 'INCREASE',
    currentWeight: base,
    suggestedWeight: applyPercent(base, percent),
    reason: `Komplet ${targetSets} × ${targetReps} powt.${onWeight}${rpePart} — czas na więcej.`,
  };
}

/** Ta sama reguła opisana nazwami ćwiczenia z planu — w tej postaci używa jej kreator progresji. */
export function suggestProgression(performance: ExercisePerformance): Suggestion | null {
  const call = decideProgression(performance);
  if (call === null) return null;
  return {
    planExerciseId: performance.planExerciseId,
    exerciseId: performance.exerciseId,
    exerciseName: performance.exerciseName,
    planWeight: performance.targetWeight as number,
    ...call,
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
