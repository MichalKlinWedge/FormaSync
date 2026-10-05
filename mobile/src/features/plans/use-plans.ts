import { asc, count, desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { exercises, planExercises, planSegments, type Sport, workoutPlans } from '@/db/schema';

/** Plany i szablony wybranego sportu (szablony w kolejności seeda, własne od najnowszych). */
export function usePlanList(sport?: Sport) {
  const { data } = useLiveQuery(
    db
      .select({
        id: workoutPlans.id,
        sport: workoutPlans.sport,
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
  // Plan wytrzymałościowy nie ma ćwiczeń, tylko odcinki — liczymy je osobno, bo złączenie
  // dwóch tabel potomnych zwielokrotniłoby wiersze.
  const { data: segmentCounts } = useLiveQuery(
    db
      .select({ planId: planSegments.planId, segmentCount: count(planSegments.id) })
      .from(planSegments)
      .groupBy(planSegments.planId),
  );
  const segmentsByPlan = new Map(segmentCounts.map((row) => [row.planId, row.segmentCount]));
  const withCounts = data.map((plan) => ({
    ...plan,
    segmentCount: segmentsByPlan.get(plan.id) ?? 0,
  }));
  const ofSport = sport === undefined ? withCounts : withCounts.filter((p) => p.sport === sport);
  return {
    templates: ofSport.filter((p) => p.isTemplate),
    // Najnowsze własne plany na górze.
    own: ofSport.filter((p) => !p.isTemplate).reverse(),
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
