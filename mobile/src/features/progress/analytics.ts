import { addDays, startOfWeek, toDateKey } from '@/lib/date';

/** Pojedyncza wykonana seria wraz z kontekstem — wejście wszystkich obliczeń. */
export type CompletedSet = {
  sessionId: number;
  /** Początek sesji (pełny znacznik czasu ISO). */
  startTime: string;
  exerciseId: number;
  exerciseName: string;
  categoryName: string | null;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
};

/**
 * Szacowany ciężar maksymalny (1RM) wzorem Epleya: w × (1 + powt./30).
 * Dla jednego powtórzenia zwraca sam ciężar. Powyżej ~12 powtórzeń wzór mocno przeszacowuje,
 * więc takich serii nie bierzemy pod uwagę.
 */
export const ONE_REP_MAX_REPS_LIMIT = 12;

export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps < 1 || reps > ONE_REP_MAX_REPS_LIMIT) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

const tonnageOf = (set: CompletedSet) => (set.reps && set.weightKg ? set.reps * set.weightKg : 0);

/** Klucz dnia sesji w czasie lokalnym. */
const sessionDayKey = (set: CompletedSet) => toDateKey(new Date(set.startTime));

export type WeekTonnage = { weekStart: string; tonnage: number; sessions: number };

/** Tonaż w kolejnych tygodniach (poniedziałek–niedziela), łącznie z tygodniami bez treningu. */
export function weeklyTonnage(sets: CompletedSet[], weeks: number, today: string): WeekTonnage[] {
  const firstWeek = startOfWeek(addDays(today, -7 * (weeks - 1)));
  const buckets = new Map<string, { tonnage: number; sessions: Set<number> }>();
  for (let i = 0; i < weeks; i++) {
    buckets.set(addDays(firstWeek, i * 7), { tonnage: 0, sessions: new Set() });
  }
  for (const set of sets) {
    const bucket = buckets.get(startOfWeek(sessionDayKey(set)));
    if (!bucket) continue;
    bucket.tonnage += tonnageOf(set);
    bucket.sessions.add(set.sessionId);
  }
  return [...buckets.entries()].map(([weekStart, b]) => ({
    weekStart,
    tonnage: b.tonnage,
    sessions: b.sessions.size,
  }));
}

export type CategoryTonnage = { name: string; tonnage: number };

/** Tonaż według partii mięśniowej, malejąco. Serie bez ciężaru nie wnoszą tonażu. */
export function tonnageByCategory(sets: CompletedSet[], fromKey?: string): CategoryTonnage[] {
  const totals = new Map<string, number>();
  for (const set of sets) {
    if (fromKey && sessionDayKey(set) < fromKey) continue;
    const tonnage = tonnageOf(set);
    if (tonnage === 0) continue;
    const name = set.categoryName ?? 'Inne';
    totals.set(name, (totals.get(name) ?? 0) + tonnage);
  }
  return [...totals.entries()]
    .map(([name, tonnage]) => ({ name, tonnage }))
    .sort((a, b) => b.tonnage - a.tonnage);
}

export type ExercisePoint = {
  date: string;
  /** Najcięższa seria dnia. */
  topWeight: number | null;
  /** Najlepszy szacowany 1RM tego dnia. */
  oneRepMax: number | null;
  tonnage: number;
  bestSetReps: number | null;
};

/** Postęp w jednym ćwiczeniu: po jednym punkcie na dzień treningowy, chronologicznie. */
export function exerciseProgress(sets: CompletedSet[], exerciseId: number): ExercisePoint[] {
  const byDay = new Map<string, CompletedSet[]>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId) continue;
    const key = sessionDayKey(set);
    byDay.set(key, [...(byDay.get(key) ?? []), set]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySets]) => {
      let topWeight: number | null = null;
      let oneRepMax: number | null = null;
      let bestSetReps: number | null = null;
      let tonnage = 0;
      for (const set of daySets) {
        tonnage += tonnageOf(set);
        if (set.weightKg !== null && (topWeight === null || set.weightKg > topWeight)) {
          topWeight = set.weightKg;
          bestSetReps = set.reps;
        }
        const estimate = set.weightKg !== null && set.reps !== null ? estimateOneRepMax(set.weightKg, set.reps) : null;
        if (estimate !== null && (oneRepMax === null || estimate > oneRepMax)) oneRepMax = estimate;
      }
      return { date, topWeight, oneRepMax, tonnage, bestSetReps };
    });
}

export type PersonalRecord = {
  exerciseId: number;
  exerciseName: string;
  maxWeight: number;
  maxWeightReps: number | null;
  maxWeightDate: string;
  bestOneRepMax: number | null;
};

/** Rekordy osobiste: najcięższa seria każdego ćwiczenia, malejąco po szacowanym 1RM. */
export function personalRecords(sets: CompletedSet[]): PersonalRecord[] {
  const records = new Map<number, PersonalRecord>();
  for (const set of sets) {
    if (set.weightKg === null || set.weightKg <= 0) continue;
    const date = sessionDayKey(set);
    const estimate = set.reps !== null ? estimateOneRepMax(set.weightKg, set.reps) : null;
    const current = records.get(set.exerciseId);

    if (!current) {
      records.set(set.exerciseId, {
        exerciseId: set.exerciseId,
        exerciseName: set.exerciseName,
        maxWeight: set.weightKg,
        maxWeightReps: set.reps,
        maxWeightDate: date,
        bestOneRepMax: estimate,
      });
      continue;
    }
    if (set.weightKg > current.maxWeight) {
      current.maxWeight = set.weightKg;
      current.maxWeightReps = set.reps;
      current.maxWeightDate = date;
    }
    if (estimate !== null && (current.bestOneRepMax === null || estimate > current.bestOneRepMax)) {
      current.bestOneRepMax = estimate;
    }
  }
  return [...records.values()].sort(
    (a, b) => (b.bestOneRepMax ?? b.maxWeight) - (a.bestOneRepMax ?? a.maxWeight),
  );
}

export type OverallStats = { sessions: number; tonnage: number; sets: number };

export function overallStats(sets: CompletedSet[]): OverallStats {
  const sessions = new Set<number>();
  let tonnage = 0;
  for (const set of sets) {
    sessions.add(set.sessionId);
    tonnage += tonnageOf(set);
  }
  return { sessions: sessions.size, tonnage, sets: sets.length };
}

/** Ćwiczenia, dla których jest co pokazać na wykresie postępu (co najmniej dwa dni z ciężarem). */
export function trackedExercises(sets: CompletedSet[]): { id: number; name: string; days: number }[] {
  const byExercise = new Map<number, { name: string; days: Set<string> }>();
  for (const set of sets) {
    if (set.weightKg === null) continue;
    const entry = byExercise.get(set.exerciseId) ?? { name: set.exerciseName, days: new Set<string>() };
    entry.days.add(sessionDayKey(set));
    byExercise.set(set.exerciseId, entry);
  }
  return [...byExercise.entries()]
    .map(([id, e]) => ({ id, name: e.name, days: e.days.size }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
}
