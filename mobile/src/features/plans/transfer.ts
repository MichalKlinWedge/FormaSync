import {
  type EnduranceDraft,
  newSegmentKey,
  type SegmentDraft,
} from '@/features/endurance/draft';
import { loadEnduranceDraft, saveEndurancePlan } from '@/features/endurance/repository';
import { createQuickExercise, findExerciseByName } from '@/features/exercises/repository';
import { isEndurance } from '@/features/sports/sport';
import type { SyncDb } from '@/db/types';

import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_REPS,
  type DraftItem,
  newItemKey,
  type PlanDraft,
} from './draft';
import { loadPlanDraft, planSport, savePlan } from './repository';
import { type SharedExercise, type SharedPlan, type SharedSegment, SHARE_VERSION } from './share';

/**
 * Trening z bazy do postaci przenośnej i z powrotem.
 *
 * Osobno od zapisu planów, bo to inna robota: tam wszystko wskazuje na wiersze tej bazy, tutaj
 * nic nie ma prawa na nie wskazywać. Przy wczytywaniu ćwiczenia wracają po nazwach, a to, czego
 * odbiorca u siebie nie ma, dopisujemy mu jako własne — plan z dziurą w połowie nie byłby planem.
 */

/** Trening gotowy do wysłania. */
export function sharedPlan(db: SyncDb, planId: number): SharedPlan {
  if (!isEndurance(planSport(db, planId))) {
    const draft = loadPlanDraft(db, planId);
    return {
      app: 'formasync',
      version: SHARE_VERSION,
      sport: draft.sport,
      title: draft.title,
      description: draft.description.trim() === '' ? null : draft.description.trim(),
      exercises: draft.items.map(toSharedExercise),
      segments: [],
    };
  }

  const plan = loadEnduranceDraft(db, planId);
  return {
    app: 'formasync',
    version: SHARE_VERSION,
    sport: plan.sport,
    title: plan.title,
    description: plan.description.trim() === '' ? null : plan.description.trim(),
    exercises: [],
    segments: toSharedSegments(plan.segments),
  };
}

const toSharedExercise = (item: DraftItem): SharedExercise => ({
  name: item.exerciseName,
  trackingType: item.trackingType,
  sets: item.targetSets,
  reps: item.targetReps,
  weightKg: item.targetWeight,
  durationSeconds: item.targetDurationSeconds,
  restSeconds: item.restDurationSeconds,
  notes: item.notes,
});

/** Płaska lista odcinków z bazy w drzewo: grupa powtórzeń trzyma swoje wnętrze w środku. */
function toSharedSegments(segments: SegmentDraft[]): SharedSegment[] {
  const shape = (segment: SegmentDraft, children: SharedSegment[]): SharedSegment => ({
    kind: segment.kind,
    repeatCount: segment.repeatCount,
    durationType: segment.durationType,
    distanceMeters: segment.distanceMeters,
    durationSeconds: segment.durationSeconds,
    targetType: segment.targetType,
    targetLow: segment.targetLow,
    targetHigh: segment.targetHigh,
    stroke: segment.stroke,
    equipment: segment.equipment,
    drill: segment.drill,
    notes: segment.notes,
    children,
  });

  return segments
    .filter((segment) => segment.parentKey === null)
    .map((segment) =>
      shape(
        segment,
        segments.filter((child) => child.parentKey === segment.key).map((child) => shape(child, [])),
      ),
    );
}

export type ImportResult = {
  planId: number;
  title: string;
  /** Ćwiczenia, których nie było w katalogu i które dopisaliśmy. */
  added: string[];
  /** Ćwiczenia zapisane u nas inaczej, niż zakłada trening — liczby w nich trzeba sprawdzić. */
  mismatched: string[];
};

/** Wczytuje trening do planów. Zwraca to, czego ekran nie jest w stanie zobaczyć sam. */
export function importPlan(db: SyncDb, shared: SharedPlan): ImportResult {
  if (isEndurance(shared.sport)) {
    const draft: EnduranceDraft = {
      sport: shared.sport,
      title: shared.title,
      description: shared.description ?? '',
      segments: toSegmentDrafts(shared.segments),
    };
    return { planId: saveEndurancePlan(db, draft), title: shared.title, added: [], mismatched: [] };
  }

  const added: string[] = [];
  const mismatched: string[] = [];
  const items = shared.exercises.map((exercise) => {
    const existing = findExerciseByName(db, exercise.name);
    if (existing === null) added.push(exercise.name);
    else if (existing.trackingType !== exercise.trackingType) mismatched.push(exercise.name);

    const id = existing?.id ?? createQuickExercise(db, exercise.name, exercise.trackingType);
    return toItem(exercise, id, existing?.trackingType ?? exercise.trackingType);
  });

  const draft: PlanDraft = {
    sport: shared.sport,
    title: shared.title,
    description: shared.description ?? '',
    sourceTemplateId: null,
    items,
  };
  return { planId: savePlan(db, draft), title: shared.title, added, mismatched };
}

/**
 * Pozycja planu z przysłanego ćwiczenia.
 *
 * Rodzaj pomiaru bierzemy z własnego katalogu, nie z pliku: to on decyduje, co ekran treningu
 * pokaże w wierszu serii. Gdy ten sam ruch mamy zapisany inaczej, niż zakłada trening —
 * u nas powtórzenia, w pliku czas — brakującej liczby nikt nam nie poda, więc wchodzi wartość
 * domyślna, a ekran mówi, że tę pozycję trzeba obejrzeć.
 */
function toItem(exercise: SharedExercise, exerciseId: number, trackingType: DraftItem['trackingType']): DraftItem {
  const timed = trackingType === 'TIME';
  return {
    key: newItemKey(),
    exerciseId,
    exerciseName: exercise.name,
    trackingType,
    targetSets: exercise.sets,
    targetReps: timed ? null : (exercise.reps ?? DEFAULT_REPS),
    targetWeight: timed ? null : exercise.weightKg,
    targetDurationSeconds: timed ? (exercise.durationSeconds ?? DEFAULT_DURATION_SECONDS) : null,
    restDurationSeconds: exercise.restSeconds,
    notes: exercise.notes,
  };
}

/** Drzewo odcinków z pliku w płaską listę z kluczami, jakiej oczekuje zapis planu. */
function toSegmentDrafts(segments: SharedSegment[]): SegmentDraft[] {
  const flat: SegmentDraft[] = [];
  const push = (segment: SharedSegment, parentKey: string | null): string => {
    const key = newSegmentKey();
    flat.push({
      key,
      parentKey,
      kind: segment.kind,
      repeatCount: segment.repeatCount,
      durationType: segment.durationType,
      distanceMeters: segment.distanceMeters,
      durationSeconds: segment.durationSeconds,
      targetType: segment.targetType,
      targetLow: segment.targetLow,
      targetHigh: segment.targetHigh,
      stroke: segment.stroke,
      equipment: segment.equipment,
      drill: segment.drill,
      notes: segment.notes,
    });
    return key;
  };

  for (const segment of segments) {
    const key = push(segment, null);
    for (const child of segment.children) push(child, key);
  }
  return flat;
}
