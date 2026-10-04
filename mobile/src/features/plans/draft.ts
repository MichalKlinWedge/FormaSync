import type { Sport, TrackingType } from '@/db/schema';

// Wersja robocza planu edytowana w kreatorze (przed zapisem do bazy).

export type DraftItem = {
  /** Stabilny klucz listy (ćwiczenie może wystąpić w planie kilka razy). */
  key: string;
  exerciseId: number;
  exerciseName: string;
  trackingType: TrackingType;
  targetSets: number;
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
  restDurationSeconds: number;
  notes: string | null;
};

export type PlanDraft = {
  /** Brak id = nowy plan. */
  id?: number;
  sport: Sport;
  title: string;
  description: string;
  sourceTemplateId: number | null;
  items: DraftItem[];
};

export type ExerciseRef = { id: number; name: string; trackingType: TrackingType };

export const DEFAULT_SETS = 3;
export const DEFAULT_REPS = 10;
export const DEFAULT_DURATION_SECONDS = 30;
export const DEFAULT_REST_SECONDS = 90;

let keyCounter = 0;
export const newItemKey = () => `item-${Date.now().toString(36)}-${(keyCounter++).toString(36)}`;

export const emptyDraft = (sport: Sport): PlanDraft => ({
  sport,
  title: '',
  description: '',
  sourceTemplateId: null,
  items: [],
});

export function createItem(exercise: ExerciseRef): DraftItem {
  const timed = exercise.trackingType === 'TIME';
  return {
    key: newItemKey(),
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    trackingType: exercise.trackingType,
    targetSets: DEFAULT_SETS,
    targetReps: timed ? null : DEFAULT_REPS,
    targetWeight: null,
    targetDurationSeconds: timed ? DEFAULT_DURATION_SECONDS : null,
    restDurationSeconds: DEFAULT_REST_SECONDS,
    notes: null,
  };
}

export function addExercises(draft: PlanDraft, exercises: ExerciseRef[]): PlanDraft {
  return { ...draft, items: [...draft.items, ...exercises.map(createItem)] };
}

export function updateItem(draft: PlanDraft, key: string, patch: Partial<Omit<DraftItem, 'key'>>): PlanDraft {
  return { ...draft, items: draft.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) };
}

export function removeItem(draft: PlanDraft, key: string): PlanDraft {
  return { ...draft, items: draft.items.filter((item) => item.key !== key) };
}

/** Przesuwa pozycję o `offset` miejsc (−1 w górę, +1 w dół); poza zakresem — bez zmian. */
export function moveItem(draft: PlanDraft, key: string, offset: number): PlanDraft {
  const from = draft.items.findIndex((item) => item.key === key);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= draft.items.length) return draft;
  const items = [...draft.items];
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  return { ...draft, items };
}

export class PlanValidationError extends Error {}

/** Walidacja przed zapisem — seria musi mieć powtórzenia (ćwiczenia na powtórzenia) lub czas (na czas). */
export function validateDraft(draft: PlanDraft): void {
  if (!draft.title.trim()) throw new PlanValidationError('Podaj nazwę planu.');
  if (draft.items.length === 0) throw new PlanValidationError('Dodaj co najmniej jedno ćwiczenie.');
  for (const item of draft.items) {
    const where = `„${item.exerciseName}”`;
    if (!Number.isInteger(item.targetSets) || item.targetSets < 1)
      throw new PlanValidationError(`${where}: liczba serii musi wynosić co najmniej 1.`);
    if (item.trackingType === 'REPS' && !(item.targetReps && item.targetReps >= 1))
      throw new PlanValidationError(`${where}: podaj liczbę powtórzeń.`);
    if (item.trackingType === 'TIME' && !(item.targetDurationSeconds && item.targetDurationSeconds >= 1))
      throw new PlanValidationError(`${where}: podaj czas trwania serii.`);
    if (item.targetWeight !== null && item.targetWeight < 0)
      throw new PlanValidationError(`${where}: ciężar nie może być ujemny.`);
    if (item.restDurationSeconds < 0) throw new PlanValidationError(`${where}: przerwa nie może być ujemna.`);
  }
}

/** Parsowanie pola liczbowego z klawiatury (akceptuje przecinek dziesiętny). Pusty tekst → null. */
export function parseNumber(text: string): number | null {
  const normalized = text.replace(',', '.').trim();
  if (normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** 90 → „1:30”, 45 → „0:45”. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Tekst celu serii, np. „3 × 8 · 60 kg” lub „3 × 0:45”. */
export function formatTarget(item: {
  targetSets: number;
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
}): string {
  const volume =
    item.targetDurationSeconds !== null && item.targetReps === null
      ? formatDuration(item.targetDurationSeconds)
      : String(item.targetReps ?? '–');
  const weight = item.targetWeight ? ` · ${formatWeight(item.targetWeight)} kg` : '';
  return `${item.targetSets} × ${volume}${weight}`;
}

export function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}
