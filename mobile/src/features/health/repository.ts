import { and, asc, eq, gte, ne } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

/**
 * Zapis danych zdrowotnych. Tabele noszą nazwy z „garmin”, bo taka była pierwotna
 * specyfikacja; dane przychodzą dziś przez Health Connect, do którego zapisuje je
 * aplikacja Garmin Connect. Nazw nie zmieniamy, żeby nie łamać istniejących kopii zapasowych.
 */

export type ActivityMetrics = {
  sessionId: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesBurned: number | null;
  rawGarminJson: string | null;
};

export type DailyHealth = {
  summaryDate: string;
  restingHeartRate: number | null;
  hrvAvgMs: number | null;
  sleepDurationMinutes: number | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  activeCalories: number | null;
  rawGarminJson: string | null;
};

const hasAnyValue = (values: (number | null)[]) => values.some((value) => value !== null);

/** Sesje zakończone w podanym oknie — do nich dopasowujemy tętno i kalorie. */
export function sessionsSince(db: SyncDb, fromIso: string) {
  return db
    .select({
      id: schema.workoutSessions.id,
      startTime: schema.workoutSessions.startTime,
      endTime: schema.workoutSessions.endTime,
    })
    .from(schema.workoutSessions)
    .where(
      and(
        ne(schema.workoutSessions.status, 'IN_PROGRESS'),
        gte(schema.workoutSessions.startTime, fromIso),
      ),
    )
    .orderBy(asc(schema.workoutSessions.startTime))
    .all()
    .filter((session): session is typeof session & { endTime: string } => session.endTime !== null);
}

/** Zapisuje metryki sesji. Pomija zapis, gdy nic nie udało się odczytać. */
export function saveActivityMetrics(db: SyncDb, metrics: ActivityMetrics): boolean {
  if (!hasAnyValue([metrics.avgHeartRate, metrics.maxHeartRate, metrics.caloriesBurned])) return false;
  db.insert(schema.garminActivityMetrics)
    .values(metrics)
    .onConflictDoUpdate({
      target: schema.garminActivityMetrics.sessionId,
      set: {
        avgHeartRate: metrics.avgHeartRate,
        maxHeartRate: metrics.maxHeartRate,
        caloriesBurned: metrics.caloriesBurned,
        rawGarminJson: metrics.rawGarminJson,
      },
    })
    .run();
  return true;
}

/** Zapisuje dzienne podsumowanie. Pomija zapis, gdy dzień nie przyniósł żadnej wartości. */
export function saveDailyHealth(db: SyncDb, daily: DailyHealth): boolean {
  if (
    !hasAnyValue([
      daily.restingHeartRate,
      daily.hrvAvgMs,
      daily.sleepDurationMinutes,
      daily.bloodPressureSystolic,
      daily.activeCalories,
    ])
  ) {
    return false;
  }
  db.insert(schema.garminDailyHealth)
    .values(daily)
    .onConflictDoUpdate({
      target: schema.garminDailyHealth.summaryDate,
      set: {
        restingHeartRate: daily.restingHeartRate,
        hrvAvgMs: daily.hrvAvgMs,
        sleepDurationMinutes: daily.sleepDurationMinutes,
        bloodPressureSystolic: daily.bloodPressureSystolic,
        bloodPressureDiastolic: daily.bloodPressureDiastolic,
        activeCalories: daily.activeCalories,
        rawGarminJson: daily.rawGarminJson,
      },
    })
    .run();
  return true;
}

/** Dane zdrowotne powiązane z konkretnym treningiem — metryki sesji i dzień, w którym się odbył. */
export function loadSessionHealth(db: SyncDb, sessionId: number, dayKey: string) {
  const activity = db
    .select()
    .from(schema.garminActivityMetrics)
    .where(eq(schema.garminActivityMetrics.sessionId, sessionId))
    .get();
  const daily = db
    .select()
    .from(schema.garminDailyHealth)
    .where(eq(schema.garminDailyHealth.summaryDate, dayKey))
    .get();
  return { activity: activity ?? null, daily: daily ?? null };
}
