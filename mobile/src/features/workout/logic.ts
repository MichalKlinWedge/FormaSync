import type { TrackingType } from '@/db/schema';

// Czysta logika trwającej sesji. Wszystkie czasy liczymy ze znaczników czasu zapisanych w bazie,
// nigdy z liczników w pamięci — timery JS nie działają, gdy Android uśpi aplikację (patrz R5 w planie).

export type ActiveSet = {
  id: number;
  setNumber: number;
  repsCompleted: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  rpe: number | null;
  /** null = seria jeszcze niewykonana. */
  completedAt: string | null;
};

export type ActiveExercise = {
  /** id wiersza session_exercises. */
  id: number;
  exerciseId: number;
  name: string;
  trackingType: TrackingType;
  targetSets: number;
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
  restDurationSeconds: number;
  sets: ActiveSet[];
};

export type ActiveSession = {
  id: number;
  startTime: string;
  title: string;
  planId: number | null;
  scheduledId: number | null;
  exercises: ActiveExercise[];
};

const ms = (iso: string) => Date.parse(iso);

export const isCompleted = (set: ActiveSet) => set.completedAt !== null;

/** Sekundy od rozpoczęcia sesji (nigdy ujemne). */
export function elapsedSeconds(startTime: string, now: number): number {
  return Math.max(0, Math.floor((now - ms(startTime)) / 1000));
}

/** Tonaż: suma powtórzeń × ciężar dla wykonanych serii. Ćwiczenia na czas nie wnoszą tonażu. */
export function sessionTonnage(exercises: ActiveExercise[]): number {
  let total = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (isCompleted(set) && set.repsCompleted && set.weightKg) total += set.repsCompleted * set.weightKg;
    }
  }
  return total;
}

export function countSets(exercises: ActiveExercise[]): { completed: number; planned: number } {
  let completed = 0;
  let planned = 0;
  for (const exercise of exercises) {
    planned += exercise.sets.length;
    completed += exercise.sets.filter(isCompleted).length;
  }
  return { completed, planned };
}

/** Pierwsza niewykonana seria — podświetlana jako bieżąca. */
export function findCurrentSet(
  exercises: ActiveExercise[],
): { exercise: ActiveExercise; set: ActiveSet } | null {
  for (const exercise of exercises) {
    const set = exercise.sets.find((s) => !isCompleted(s));
    if (set) return { exercise, set };
  }
  return null;
}

export type RestState = {
  /** Ćwiczenie, po którego serii trwa przerwa. */
  exerciseName: string;
  endsAt: number;
  remainingSeconds: number;
  totalSeconds: number;
};

/**
 * Przerwa wynika z ostatnio ukończonej serii i czasu przerwy jej ćwiczenia.
 * Zwraca null, gdy przerwa już minęła albo nie ukończono jeszcze żadnej serii —
 * dzięki temu stan odtwarza się poprawnie po ponownym otwarciu aplikacji.
 */
export function restState(exercises: ActiveExercise[], now: number): RestState | null {
  let latest: { exercise: ActiveExercise; completedAt: number } | null = null;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.completedAt) continue;
      const at = ms(set.completedAt);
      if (!latest || at > latest.completedAt) latest = { exercise, completedAt: at };
    }
  }
  if (!latest || latest.exercise.restDurationSeconds <= 0) return null;

  const endsAt = latest.completedAt + latest.exercise.restDurationSeconds * 1000;
  if (now >= endsAt) return null;
  return {
    exerciseName: latest.exercise.name,
    endsAt,
    remainingSeconds: Math.ceil((endsAt - now) / 1000),
    totalSeconds: latest.exercise.restDurationSeconds,
  };
}

/** „7:05”, a od godziny „1:07:05”. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

export type SessionSummary = {
  durationSeconds: number;
  tonnage: number;
  completedSets: number;
  plannedSets: number;
  exercisesWithWork: number;
};

export function summarize(session: ActiveSession, now: number): SessionSummary {
  const { completed, planned } = countSets(session.exercises);
  return {
    durationSeconds: elapsedSeconds(session.startTime, now),
    tonnage: sessionTonnage(session.exercises),
    completedSets: completed,
    plannedSets: planned,
    exercisesWithWork: session.exercises.filter((e) => e.sets.some(isCompleted)).length,
  };
}
