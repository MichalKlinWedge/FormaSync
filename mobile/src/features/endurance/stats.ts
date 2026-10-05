import { and, eq, isNotNull, ne } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { toDateKey } from '@/lib/date';

import { paceFrom } from './format';

/**
 * Statystyki wytrzymałościowe. Tonaż i rekordy ciężaru nic tu nie znaczą; liczą się dystans,
 * czas i tempo. Liczymy je z zapisanych odcinków, bo tylko one mówią, co faktycznie pokonane.
 */

export type EnduranceWorkout = {
  sessionId: number;
  startTime: string;
  title: string;
  meters: number;
  seconds: number;
  /** Sekundy na kilometr z całego treningu; null, gdy nie da się policzyć. */
  pace: number | null;
  /** Tempo samych odcinków pracy — bez rozgrzewki, przerw i schłodzenia. */
  workPace: number | null;
};

export function loadEnduranceWorkouts(db: SyncDb, sport: schema.Sport): EnduranceWorkout[] {
  const sessions = db
    .select({
      id: schema.workoutSessions.id,
      startTime: schema.workoutSessions.startTime,
      title: schema.workoutSessions.title,
      planTitle: schema.workoutPlans.title,
    })
    .from(schema.workoutSessions)
    .leftJoin(schema.workoutPlans, eq(schema.workoutSessions.planId, schema.workoutPlans.id))
    .where(
      and(ne(schema.workoutSessions.status, 'IN_PROGRESS'), eq(schema.workoutSessions.sport, sport)),
    )
    .all();

  // Rodzaj odcinka leży w migawce planu, a nie w zapisie wykonania — stąd złączenie.
  const segments = db
    .select({
      sessionId: schema.loggedSegments.sessionId,
      kind: schema.sessionSegments.kind,
      distanceMeters: schema.loggedSegments.distanceMeters,
      durationSeconds: schema.loggedSegments.durationSeconds,
    })
    .from(schema.loggedSegments)
    .innerJoin(
      schema.sessionSegments,
      eq(schema.loggedSegments.sessionSegmentId, schema.sessionSegments.id),
    )
    .where(isNotNull(schema.loggedSegments.completedAt))
    .all();

  return sessions
    .map((session) => {
      const mine = segments.filter((segment) => segment.sessionId === session.id);
      const sum = (rows: typeof mine) => ({
        meters: rows.reduce((total, segment) => total + (segment.distanceMeters ?? 0), 0),
        seconds: rows.reduce((total, segment) => total + (segment.durationSeconds ?? 0), 0),
      });
      const all = sum(mine);
      const work = sum(mine.filter((segment) => segment.kind === 'WORK'));
      return {
        sessionId: session.id,
        startTime: session.startTime,
        title: session.title ?? session.planTitle ?? 'Trening',
        meters: all.meters,
        seconds: all.seconds,
        pace: paceFrom(all.meters, all.seconds),
        workPace: paceFrom(work.meters, work.seconds),
      };
    })
    .filter((workout) => workout.meters > 0 || workout.seconds > 0)
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
}

export type WeeklyVolume = { weekKey: string; meters: number; seconds: number };

/** Dystans i czas w kolejnych tygodniach, od najstarszego — do wykresu słupkowego. */
export function weeklyVolume(workouts: EnduranceWorkout[], weeks = 8, now = new Date()): WeeklyVolume[] {
  const buckets = new Map<string, WeeklyVolume>();
  const monday = (date: Date) => {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    // Poniedziałek jako początek tygodnia: w JS niedziela to 0, więc cofamy o 6.
    copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
    return copy;
  };

  const first = monday(now);
  first.setDate(first.getDate() - (weeks - 1) * 7);
  for (let i = 0; i < weeks; i += 1) {
    const start = new Date(first);
    start.setDate(start.getDate() + i * 7);
    buckets.set(toDateKey(start), { weekKey: toDateKey(start), meters: 0, seconds: 0 });
  }

  for (const workout of workouts) {
    const key = toDateKey(monday(new Date(workout.startTime)));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.meters += workout.meters;
    bucket.seconds += workout.seconds;
  }

  return [...buckets.values()];
}

export type EnduranceSummary = {
  workouts: number;
  meters: number;
  seconds: number;
  /** Najszybsze tempo odcinków pracy — najniższa liczba sekund na kilometr. */
  bestPace: number | null;
  longestMeters: number;
};

export function summarizeEndurance(workouts: EnduranceWorkout[]): EnduranceSummary {
  // Rekord liczymy z odcinków pracy: tempo całości zaniża rozgrzewka i przerwy, więc
  // porównywanie go między treningami o różnej budowie nic nie mówi.
  const paces = workouts
    .map((workout) => workout.workPace ?? workout.pace)
    .filter((pace): pace is number => pace !== null);
  return {
    workouts: workouts.length,
    meters: workouts.reduce((sum, workout) => sum + workout.meters, 0),
    seconds: workouts.reduce((sum, workout) => sum + workout.seconds, 0),
    bestPace: paces.length === 0 ? null : Math.min(...paces),
    longestMeters: workouts.reduce((best, workout) => Math.max(best, workout.meters), 0),
  };
}
