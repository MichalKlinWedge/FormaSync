import type { TrackingType } from '@/db/schema';
import { estimateOneRepMax } from '@/features/progress/analytics';
import { decideProgression, type SetOutcome } from '@/features/progress/progression';
import { formatKg, formatNumber, pluralWith } from '@/lib/number';

/**
 * Dorobek w jednym ćwiczeniu: ile razy było robione, czy coś z tego wyszło i co zrobić
 * następnym razem.
 *
 * Sugestia liczy się tą samą regułą, co progresja planu — zmienia się tylko to, skąd bierze
 * się cel. Plan ma go wpisanego, a tutaj celem jest ostatni trening: tyle serii, ile poszło
 * na najcięższym ciężarze, i tyle powtórzeń, ile wtedy wyszło.
 */

/** Pojedyncza wykonana seria tego ćwiczenia, razem z sesją, w której padła. */
export type ExerciseSetRecord = {
  sessionId: number;
  /** Początek sesji (znacznik ISO) — po nim grupujemy serie w treningi. */
  startTime: string;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  rpe: number | null;
};

/** Najlepsza seria w historii — wedle miary właściwej dla rodzaju ćwiczenia. */
export type BestSet = {
  startTime: string;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  /** Szacowany ciężar maksymalny; null, gdy serii nie da się nim opisać. */
  oneRepMax: number | null;
};

/** Czym mierzymy postęp w tym ćwiczeniu — od tego zależą jednostki na ekranie. */
export type Metric = 'WEIGHT' | 'REPS' | 'TIME';

export type ExerciseHistory = {
  metric: Metric;
  /** Ile treningów zawierało to ćwiczenie. */
  sessions: number;
  /** Ile serii w sumie. */
  sets: number;
  firstAt: string;
  lastAt: string;
  best: BestSet;
  /** Zmiana najlepszej serii między pierwszym a ostatnim treningiem; null przy jednym treningu. */
  change: number | null;
  /** Co zrobić następnym razem. */
  advice: string;
};

/** Trening: serie z jednej sesji, w kolejności zapisu. */
type Workout = { startTime: string; sets: ExerciseSetRecord[] };

function groupBySession(records: ExerciseSetRecord[]): Workout[] {
  const byId = new Map<number, Workout>();
  for (const record of records) {
    const workout = byId.get(record.sessionId) ?? { startTime: record.startTime, sets: [] };
    workout.sets.push(record);
    byId.set(record.sessionId, workout);
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

/**
 * Miara „lepszej” serii zależy od tego, co ćwiczenie w ogóle mierzy: ciężar porównujemy przez
 * szacowany ciężar maksymalny, bo 100 kg × 5 jest więcej warte niż 110 kg × 1; ćwiczenia na masie
 * ciała po powtórzeniach, a na czas po sekundach.
 */
const scoreOf = (set: ExerciseSetRecord, tracking: TrackingType): number => {
  if (tracking === 'TIME') return set.durationSeconds ?? 0;
  if (set.weightKg && set.weightKg > 0 && set.reps) {
    return estimateOneRepMax(set.weightKg, set.reps) ?? set.weightKg;
  }
  return set.reps ?? 0;
};

const bestOf = (sets: ExerciseSetRecord[], tracking: TrackingType): ExerciseSetRecord =>
  sets.reduce((best, set) => (scoreOf(set, tracking) > scoreOf(best, tracking) ? set : best));

const average = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Składa dorobek z zapisanych serii. Zwraca null, gdy ćwiczenia nigdy nie wykonano — wtedy nie
 * ma o czym pisać i sekcja w ogóle się nie pokazuje.
 */
export function summarizeExercise(
  records: ExerciseSetRecord[],
  tracking: TrackingType,
): ExerciseHistory | null {
  if (records.length === 0) return null;
  const workouts = groupBySession(records);
  const first = workouts[0];
  const last = workouts[workouts.length - 1];
  const best = bestOf(records, tracking);
  const metric: Metric =
    tracking === 'TIME' ? 'TIME' : records.some((set) => (set.weightKg ?? 0) > 0) ? 'WEIGHT' : 'REPS';

  return {
    metric,
    sessions: workouts.length,
    sets: records.length,
    firstAt: first.startTime,
    lastAt: last.startTime,
    best: {
      startTime: best.startTime,
      reps: best.reps,
      weightKg: best.weightKg,
      durationSeconds: best.durationSeconds,
      oneRepMax:
        best.weightKg && best.reps ? estimateOneRepMax(best.weightKg, best.reps) : null,
    },
    change:
      workouts.length < 2
        ? null
        : scoreOf(bestOf(last.sets, tracking), tracking) - scoreOf(bestOf(first.sets, tracking), tracking),
    advice: adviseNext(last.sets, tracking),
  };
}

/**
 * Sugestia na kolejny trening. Przy ciężarze oddajemy głos regule progresji; bez ciężaru
 * zostają powtórzenia albo czas, a tam krok jest z natury mniejszy i prostszy.
 */
function adviseNext(sets: ExerciseSetRecord[], tracking: TrackingType): string {
  if (tracking === 'TIME') return adviseTime(sets);

  const heaviest = Math.max(...sets.map((set) => set.weightKg ?? 0));
  if (heaviest > 0) {
    // Serie rozgrzewkowe nie mówią nic o progresji — liczy się to, co poszło na docelowym ciężarze.
    const working = sets.filter((set) => (set.weightKg ?? 0) === heaviest);
    const call = decideProgression({
      targetSets: working.length,
      targetReps: Math.max(...working.map((set) => set.reps ?? 0)),
      targetWeight: heaviest,
      sets: working.map(toOutcome),
    });
    if (call !== null) {
      return call.advice === 'HOLD'
        ? `${call.reason} Zostań przy ${formatKg(heaviest)}.`
        : `${call.reason} Następnym razem ${formatKg(call.suggestedWeight)}.`;
    }
  }

  return adviseReps(sets);
}

const toOutcome = (set: ExerciseSetRecord): SetOutcome => ({
  reps: set.reps,
  weightKg: set.weightKg,
  rpe: set.rpe,
});

/** Ćwiczenie na masie ciała: rośnie liczba powtórzeń, nie ciężar. */
function adviseReps(sets: ExerciseSetRecord[]): string {
  const reps = sets.map((set) => set.reps ?? 0).filter((value) => value > 0);
  if (reps.length === 0) return 'Zapisz powtórzenia w kolejnym treningu, a podpowiem, co dalej.';

  const top = Math.max(...reps);
  const done = `Ostatnio ${pluralWith(sets.length, 'seria', 'serie', 'serii')} po ${formatNumber(top)} powt.`;
  const rpe = average(sets.map((set) => set.rpe).filter((value): value is number => value !== null));

  if (rpe !== null && rpe >= 9) return `${done} przy wysokim RPE — powtórz ten sam układ.`;
  if (reps.some((value) => value < top)) return `${done} Wyrównaj serie, zanim dołożysz powtórzenia.`;
  return `${done} Spróbuj dołożyć po jednym: ${sets.length} × ${formatNumber(top + 1)}.`;
}

/** Ćwiczenie na czas: krok to sekundy, a przy ciężkim ostatnim razie żaden. */
function adviseTime(sets: ExerciseSetRecord[]): string {
  const seconds = sets.map((set) => set.durationSeconds ?? 0).filter((value) => value > 0);
  if (seconds.length === 0) return 'Zapisz czas w kolejnym treningu, a podpowiem, co dalej.';

  const top = Math.max(...seconds);
  const done = `Ostatnio najdłużej ${formatNumber(top)} s.`;
  const rpe = average(sets.map((set) => set.rpe).filter((value): value is number => value !== null));

  if (rpe !== null && rpe >= 9) return `${done} Przy tym wysiłku powtórz ten sam czas.`;
  const step = rpe !== null && rpe > 7 ? 5 : 10;
  return `${done} Spróbuj wytrzymać ${formatNumber(top + step)} s.`;
}

/** Opis najlepszej serii — tyle, ile da się o niej powiedzieć. */
export function describeBest(best: BestSet, metric: Metric): string {
  if (metric === 'TIME') {
    return best.durationSeconds ? `${formatNumber(best.durationSeconds)} s` : '—';
  }
  const reps = best.reps ? `${formatNumber(best.reps)} powt.` : null;
  if (!best.weightKg || best.weightKg <= 0) return reps ?? '—';
  const core = reps === null ? formatKg(best.weightKg) : `${formatKg(best.weightKg)} × ${formatNumber(best.reps!)}`;
  return best.oneRepMax === null ? core : `${core} · 1RM ok. ${formatKg(Math.round(best.oneRepMax))}`;
}

/**
 * Zmiana między pierwszym a ostatnim treningiem. Zero to nie porażka, tylko brak zmiany —
 * i tak to nazywamy, zamiast pokazywać „+0”.
 */
export function describeChange(change: number, metric: Metric): string {
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0) return 'bez zmian';
  const sign = rounded > 0 ? '+' : '−';
  const value = Math.abs(rounded);
  if (metric === 'TIME') return `${sign}${formatNumber(value)} s`;
  if (metric === 'REPS') return `${sign}${formatNumber(value)} powt.`;
  return `${sign}${formatKg(value)}`;
}
