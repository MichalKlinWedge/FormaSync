import type { TrackingType } from '@/db/schema';
import { decideProgression, type SetOutcome } from '@/features/progress/progression';
import { formatKg, formatNumber, pluralWith } from '@/lib/number';

/**
 * Cel na kolejny trening wyliczony z ostatniego wykonania ćwiczenia.
 *
 * Reguła jest ta sama, co w progresji planu — zmienia się tylko to, skąd bierze się punkt
 * wyjścia. Plan ma cel wpisany, a tutaj celem jest ostatni trening: tyle serii, ile poszło
 * na najcięższym ciężarze, i tyle powtórzeń, ile wtedy wyszło.
 *
 * Liczby i zdanie wychodzą stąd razem, bo rozjechanie ich byłoby gorsze niż brak podpowiedzi:
 * karta ćwiczenia pisze „następnym razem 85 kg”, a kreator planu musi wpisać dokładnie 85.
 */

/** Wykonana seria w postaci, jakiej potrzebuje cel; `ExerciseSetRecord` spełnia ten kształt. */
export type DoneSet = SetOutcome & { durationSeconds: number | null };

export type NextTarget = {
  targetSets: number;
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
  /** Skąd te liczby — zdanie do pokazania przy polach. */
  reason: string;
};

const average = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const averageRpe = (sets: DoneSet[]): number | null =>
  average(sets.map((set) => set.rpe).filter((rpe): rpe is number => rpe !== null));

/**
 * Cel po ostatnim treningu tego ćwiczenia. Zwraca null, gdy nie ma czego policzyć — bez
 * zapisanych powtórzeń ani czasu każda liczba byłaby wymyślona.
 */
export function nextTarget(sets: DoneSet[], tracking: TrackingType): NextTarget | null {
  if (sets.length === 0) return null;
  if (tracking === 'TIME') return fromTime(sets);
  // Serie rozgrzewkowe nie mówią nic o progresji — liczy się to, co poszło na docelowym ciężarze.
  const heaviest = Math.max(...sets.map((set) => set.weightKg ?? 0));
  return (heaviest > 0 ? fromWeight(sets, heaviest) : null) ?? fromReps(sets);
}

/** Ćwiczenie z ciężarem: o kroku decyduje reguła progresji, ta sama co w planie. */
function fromWeight(sets: DoneSet[], heaviest: number): NextTarget | null {
  const working = sets.filter((set) => (set.weightKg ?? 0) === heaviest);
  const targetReps = Math.max(...working.map((set) => set.reps ?? 0));
  const call = decideProgression({
    targetSets: working.length,
    targetReps,
    targetWeight: heaviest,
    sets: working,
  });
  if (call === null) return null;

  return {
    targetSets: working.length,
    targetReps,
    targetWeight: call.suggestedWeight,
    targetDurationSeconds: null,
    reason:
      call.advice === 'HOLD'
        ? `${call.reason} Zostań przy ${formatKg(call.suggestedWeight)}.`
        : `${call.reason} Następnym razem ${formatKg(call.suggestedWeight)}.`,
  };
}

/** Ćwiczenie na masie ciała: rośnie liczba powtórzeń, nie ciężar. */
function fromReps(sets: DoneSet[]): NextTarget | null {
  const reps = sets.map((set) => set.reps ?? 0).filter((value) => value > 0);
  if (reps.length === 0) return null;

  const top = Math.max(...reps);
  const done = `Ostatnio ${pluralWith(sets.length, 'seria', 'serie', 'serii')} po ${formatNumber(top)} powt.`;
  const rpe = averageRpe(sets);
  const target = (targetReps: number, reason: string): NextTarget => ({
    targetSets: sets.length,
    targetReps,
    targetWeight: null,
    targetDurationSeconds: null,
    reason,
  });

  if (rpe !== null && rpe >= 9) return target(top, `${done} przy wysokim RPE — powtórz ten sam układ.`);
  if (reps.some((value) => value < top))
    return target(top, `${done} Wyrównaj serie, zanim dołożysz powtórzenia.`);
  return target(top + 1, `${done} Spróbuj dołożyć po jednym: ${sets.length} × ${formatNumber(top + 1)}.`);
}

/** Ćwiczenie na czas: krok to sekundy, a przy ciężkim ostatnim razie żaden. */
function fromTime(sets: DoneSet[]): NextTarget | null {
  const seconds = sets.map((set) => set.durationSeconds ?? 0).filter((value) => value > 0);
  if (seconds.length === 0) return null;

  const top = Math.max(...seconds);
  const done = `Ostatnio najdłużej ${formatNumber(top)} s.`;
  const rpe = averageRpe(sets);
  const step = rpe !== null && rpe >= 9 ? 0 : rpe !== null && rpe > 7 ? 5 : 10;

  return {
    targetSets: sets.length,
    targetReps: null,
    targetWeight: null,
    targetDurationSeconds: top + step,
    reason:
      step === 0
        ? `${done} Przy tym wysiłku powtórz ten sam czas.`
        : `${done} Spróbuj wytrzymać ${formatNumber(top + step)} s.`,
  };
}
