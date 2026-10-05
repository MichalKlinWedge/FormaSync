import { asc, eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { isEndurance } from '@/features/sports/sport';

import { connectApi } from './client';
import { buildWorkoutPayload, type GarminPlan, type GarminSegment } from './payload';

/** Wysyłka planu do biblioteki Garmin Connect i wpisywanie go do kalendarza Garmina. */

const WORKOUTS = '/workout-service';

/**
 * Plan w postaci potrzebnej do złożenia treści dla Garmina. Siła idzie ćwiczeniami,
 * reszta odcinkami — grupa powtórzeń dostaje swoje wnętrze w `children`.
 */
export function loadGarminPlan(db: SyncDb, planId: number): GarminPlan | null {
  const plan = db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).get();
  if (!plan) return null;

  if (!isEndurance(plan.sport)) {
    const exercises = db
      .select({
        name: schema.exercises.name,
        garminCategory: schema.exercises.garminCategory,
        trackingType: schema.exercises.trackingType,
        targetSets: schema.planExercises.targetSets,
        targetReps: schema.planExercises.targetReps,
        targetWeight: schema.planExercises.targetWeight,
        targetDurationSeconds: schema.planExercises.targetDurationSeconds,
        restDurationSeconds: schema.planExercises.restDurationSeconds,
      })
      .from(schema.planExercises)
      .innerJoin(schema.exercises, eq(schema.planExercises.exerciseId, schema.exercises.id))
      .where(eq(schema.planExercises.planId, planId))
      .orderBy(asc(schema.planExercises.orderIndex))
      .all();
    return { title: plan.title, sport: plan.sport, exercises, segments: [] };
  }

  const rows = db
    .select()
    .from(schema.planSegments)
    .where(eq(schema.planSegments.planId, planId))
    .orderBy(asc(schema.planSegments.orderIndex))
    .all();

  const toSegment = (row: (typeof rows)[number]): GarminSegment => ({
    kind: row.kind,
    durationType: row.durationType,
    distanceMeters: row.distanceMeters,
    durationSeconds: row.durationSeconds,
    targetType: row.targetType,
    targetLow: row.targetLow,
    targetHigh: row.targetHigh,
    repeatCount: row.repeatCount,
    children: rows.filter((child) => child.parentId === row.id).map(toSegment),
  });

  return {
    title: plan.title,
    sport: plan.sport,
    exercises: [],
    segments: rows.filter((row) => row.parentId === null).map(toSegment),
  };
}

type WorkoutListItem = { workoutId: number; workoutName: string | null };

/**
 * Identyfikatory treningów o tej samej nazwie, od najnowszego. Kolejność ma znaczenie:
 * nadpisujemy najnowszy, bo to jego zwykle dotyczą wpisy w kalendarzu Garmina.
 */
export async function findByName(title: string): Promise<number[]> {
  const list = (await connectApi<WorkoutListItem[]>(`${WORKOUTS}/workouts?start=0&limit=100`)) ?? [];
  const wanted = title.trim().toLowerCase();
  return list
    .filter((item) => (item.workoutName ?? '').trim().toLowerCase() === wanted)
    .map((item) => item.workoutId)
    .sort((a, b) => b - a);
}

export type SendResult = {
  workoutId: number;
  /** true, gdy nadpisaliśmy trening, który już tam był. */
  overwritten: boolean;
  /** Pozostałe kopie o tej samej nazwie — nie ruszamy ich, ale warto o nich powiedzieć. */
  duplicates: number[];
};

/**
 * Wysyła plan. Trening o tej samej nazwie nadpisujemy w miejscu zamiast dokładać obok:
 * zachowany identyfikator nie unieważnia wpisów w kalendarzu Garmina, a biblioteka nie
 * zarasta kopiami przy każdym kolejnym wysłaniu.
 */
export async function sendPlan(db: SyncDb, planId: number): Promise<SendResult> {
  const plan = loadGarminPlan(db, planId);
  if (!plan) throw new Error('Nie ma takiego planu.');

  const payload = buildWorkoutPayload(plan);
  const existing = await findByName(plan.title);

  if (existing.length === 0) {
    const created = await connectApi<{ workoutId: number }>(`${WORKOUTS}/workout`, {
      method: 'POST',
      body: payload,
    });
    const workoutId = created!.workoutId;
    rememberWorkoutId(db, planId, workoutId);
    return { workoutId, overwritten: false, duplicates: [] };
  }

  const [workoutId, ...duplicates] = existing;
  await connectApi(`${WORKOUTS}/workout/${workoutId}`, {
    method: 'PUT',
    body: { ...payload, workoutId },
  });
  rememberWorkoutId(db, planId, workoutId);
  return { workoutId, overwritten: true, duplicates };
}

function rememberWorkoutId(db: SyncDb, planId: number, workoutId: number): void {
  db.update(schema.workoutPlans)
    .set({ garminWorkoutId: String(workoutId) })
    .where(eq(schema.workoutPlans.id, planId))
    .run();
}

/** Wpisuje trening do kalendarza Garmina i zwraca identyfikator wpisu. */
export async function scheduleOnGarmin(workoutId: number, dateKey: string): Promise<number | null> {
  const scheduled = await connectApi<{ workoutScheduleId?: number }>(
    `${WORKOUTS}/schedule/${workoutId}`,
    { method: 'POST', body: { date: dateKey } },
  );
  return scheduled?.workoutScheduleId ?? null;
}

/** Zdejmuje wpis z kalendarza Garmina. Sam trening zostaje w bibliotece. */
export const unscheduleOnGarmin = (scheduleId: number): Promise<unknown> =>
  connectApi(`${WORKOUTS}/schedule/${scheduleId}`, { method: 'DELETE' });

export const deleteWorkout = (workoutId: number): Promise<unknown> =>
  connectApi(`${WORKOUTS}/workout/${workoutId}`, { method: 'DELETE' });
