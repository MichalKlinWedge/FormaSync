import { asc, count, desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { exercises, planExercises, workoutPlans } from '@/db/schema';

/** Wszystkie plany i szablony z liczbą ćwiczeń (szablony w kolejności seeda, własne od najnowszych). */
export function usePlanList() {
  const { data } = useLiveQuery(
    db
      .select({
        id: workoutPlans.id,
        title: workoutPlans.title,
        description: workoutPlans.description,
        isTemplate: workoutPlans.isTemplate,
        exerciseCount: count(planExercises.id),
      })
      .from(workoutPlans)
      .leftJoin(planExercises, eq(planExercises.planId, workoutPlans.id))
      .groupBy(workoutPlans.id)
      .orderBy(desc(workoutPlans.isTemplate), asc(workoutPlans.id)),
  );
  return {
    templates: data.filter((p) => p.isTemplate),
    // Najnowsze własne plany na górze.
    own: data.filter((p) => !p.isTemplate).reverse(),
  };
}

export function usePlanDetails(id: number) {
  const { data: plans } = useLiveQuery(db.select().from(workoutPlans).where(eq(workoutPlans.id, id)), [id]);
  const { data: items } = useLiveQuery(
    db
      .select({
        id: planExercises.id,
        exerciseId: exercises.id,
        exerciseName: exercises.name,
        targetSets: planExercises.targetSets,
        targetReps: planExercises.targetReps,
        targetWeight: planExercises.targetWeight,
        targetDurationSeconds: planExercises.targetDurationSeconds,
        restDurationSeconds: planExercises.restDurationSeconds,
      })
      .from(planExercises)
      .innerJoin(exercises, eq(planExercises.exerciseId, exercises.id))
      .where(eq(planExercises.planId, id))
      .orderBy(asc(planExercises.orderIndex)),
    [id],
  );
  return { plan: plans[0], items };
}
