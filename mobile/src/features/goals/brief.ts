import type { Sport } from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { sportRecords } from '@/features/endurance/records';
import { loadEnduranceWorkouts, weeklyVolume } from '@/features/endurance/stats';

import type { GoalBrief } from './planner';

/**
 * Forma bieżąca odczytana z historii. To ta część, której nie trzeba wpisywać ręcznie: aplikacja
 * już wie, ile biegasz w tygodniu i jak szybko, bo sama te treningi zapisała.
 */

/** Ile ostatnich tygodni mówi o obecnej formie. Dalej to już nie „teraz”. */
export const FORM_WEEKS = 4;

export type FormWorkout = {
  date: string;
  meters: number;
  seconds: number;
  paceSeconds: number | null;
};

export type CurrentForm = {
  /** Średnia objętość tygodniowa; zero, gdy nie ma czego średnić. */
  weeklyMeters: number;
  bestPaceSeconds: number | null;
  longestMeters: number;
  /** Treningi z okresu, od najnowszego — podstawa briefu dla modelu. */
  history: FormWorkout[];
};

export function currentForm(db: SyncDb, sport: Sport, now: Date = new Date()): CurrentForm {
  const workouts = loadEnduranceWorkouts(db, sport);
  const weeks = weeklyVolume(workouts, FORM_WEEKS, now);

  // Tygodnie puste pomijamy przy średniej: tydzień wolnego albo choroba nie znaczy, że ktoś
  // przestał biegać — a wliczony jako zero obniżyłby cały plan o ćwiartkę.
  const trained = weeks.map((week) => week.meters).filter((meters) => meters > 0);
  const since = new Date(now.getTime() - FORM_WEEKS * 7 * 24 * 3600 * 1000).toISOString();
  const records = sportRecords(workouts, sport);

  return {
    weeklyMeters:
      trained.length === 0
        ? 0
        : Math.round(trained.reduce((sum, meters) => sum + meters, 0) / trained.length),
    bestPaceSeconds: records.bestPace?.value ?? null,
    longestMeters: records.longestDistance?.value ?? 0,
    history: workouts
      .filter((workout) => workout.startTime >= since)
      .map((workout) => ({
        date: workout.startTime.slice(0, 10),
        meters: Math.round(workout.meters),
        seconds: workout.seconds,
        paceSeconds: workout.workPace ?? workout.pace,
      })),
  };
}

export type GoalRecord = {
  sport: Sport;
  title: string;
  eventDate: string;
  distanceMeters: number;
  targetSeconds: number | null;
  weekDays: string;
};

/** Dni tygodnia z zapisu „0 3 5” na liczby. */
export const parseWeekDays = (value: string): number[] =>
  [
    ...new Set(
      value
        .split(/\s+/)
        .map((part) => Number(part))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ].sort((a, b) => a - b);

export const serializeWeekDays = (days: number[]): string =>
  [...new Set(days)].sort((a, b) => a - b).join(' ');

/** Brief planisty: cel z bazy plus forma z historii. */
export function buildBrief(db: SyncDb, goal: GoalRecord, now: Date = new Date()): GoalBrief {
  const form = currentForm(db, goal.sport, now);
  return {
    sport: goal.sport,
    title: goal.title,
    distanceMeters: goal.distanceMeters,
    eventDate: goal.eventDate,
    targetSeconds: goal.targetSeconds,
    weekDays: parseWeekDays(goal.weekDays),
    weeklyMeters: form.weeklyMeters,
    bestPaceSeconds: form.bestPaceSeconds,
  };
}
