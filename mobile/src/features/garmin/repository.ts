import { asc, eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

import type { FitExercise } from './fit-workout';

/** Plan w postaci potrzebnej do złożenia pliku FIT. Null, gdy plan nie istnieje. */
export function loadPlanForFit(
  db: SyncDb,
  planId: number,
): { title: string; exercises: FitExercise[] } | null {
  const plan = db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).get();
  if (!plan) return null;

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

  return { title: plan.title, exercises };
}
