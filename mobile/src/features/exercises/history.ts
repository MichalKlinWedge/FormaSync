import type { TrackingType } from '@/db/schema';
import { estimateOneRepMax } from '@/features/progress/analytics';
import { nextTarget } from '@/features/progress/targets';
import { formatKg, formatNumber } from '@/lib/number';

/**
 * Dorobek w jednym ćwiczeniu: ile razy było robione, czy coś z tego wyszło i co zrobić
 * następnym razem.
 *
 * Sugestię liczy `nextTarget` — ta sama reguła, która podpowiada cel przy dodawaniu ćwiczenia
 * do planu. Tutaj z niej bierzemy samo zdanie, bo karta ćwiczenia niczego nie zapisuje.
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
 * Sugestia na kolejny trening. Bez zapisanych powtórzeń ani czasu nie ma czego policzyć, więc
 * zostaje prośba o zapis — i tyle, bo zmyślona liczba byłaby gorsza od jej braku.
 */
function adviseNext(sets: ExerciseSetRecord[], tracking: TrackingType): string {
  const target = nextTarget(sets, tracking);
  if (target !== null) return target.reason;
  return tracking === 'TIME'
    ? 'Zapisz czas w kolejnym treningu, a podpowiem, co dalej.'
    : 'Zapisz powtórzenia w kolejnym treningu, a podpowiem, co dalej.';
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
