import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { goalWorkouts, scheduledWorkouts, trainingGoals, workoutSessions } from '@/db/schema';
import { todayKey } from '@/lib/date';

import { currentForm, type CurrentForm } from './brief';
import {
  goalPlan,
  goalProgress,
  listGoals,
  loadGoal,
  pastGoals,
  type Goal,
  type GoalProgress,
  type GoalWorkout,
} from './repository';
import type { Sport } from '@/db/schema';

/** Cele podzielone na te w toku i te zamknięte. */
export function useGoals(): { active: Goal[]; past: Goal[] } {
  const { data: signal } = useLiveQuery(db.select({ id: trainingGoals.id }).from(trainingGoals));
  return useMemo(
    () => {
      const closed = new Set(pastGoals(db).map((goal) => goal.id));
      return { active: listGoals(db).filter((goal) => !closed.has(goal.id)), past: pastGoals(db) };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane czytają funkcje repozytorium
    [signal],
  );
}

export type GoalDetails = {
  goal: Goal | null;
  workouts: GoalWorkout[];
  progress: GoalProgress;
};

/**
 * Cel razem z planem i postępem. Obserwujemy też terminy i sesje, bo postęp zmienia się nie na
 * tym ekranie — trening kończy się w zakładce treningu, a stąd ma być widać, że doszedł.
 */
export function useGoal(goalId: number): GoalDetails {
  const { data: goals } = useLiveQuery(db.select({ id: trainingGoals.id }).from(trainingGoals));
  const { data: plan } = useLiveQuery(db.select({ id: goalWorkouts.id }).from(goalWorkouts));
  const { data: terms } = useLiveQuery(db.select({ id: scheduledWorkouts.id }).from(scheduledWorkouts));
  const { data: sessions } = useLiveQuery(db.select({ id: workoutSessions.id }).from(workoutSessions));

  return useMemo(
    () => ({
      goal: loadGoal(db, goalId),
      workouts: goalPlan(db, goalId),
      progress: goalProgress(db, goalId),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnały zmiany, dane czytają funkcje repozytorium
    [goals, plan, terms, sessions, goalId],
  );
}

/** Forma bieżąca z historii — podstawa planu, pokazywana przed jego ułożeniem. */
export function useCurrentForm(sport: Sport): CurrentForm {
  const { data: signal } = useLiveQuery(db.select({ id: workoutSessions.id }).from(workoutSessions));
  return useMemo(
    () => currentForm(db, sport),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane pobiera currentForm
    [signal, sport],
  );
}

/** Ile tygodni zostało do startu; zero, gdy termin minął. */
export function weeksLeft(goal: Goal, from: string = todayKey()): number {
  const days = Math.ceil(
    (Date.parse(`${goal.eventDate}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / (24 * 3600 * 1000),
  );
  return days <= 0 ? 0 : Math.ceil(days / 7);
}
