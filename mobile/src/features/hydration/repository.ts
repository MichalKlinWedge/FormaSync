import { and, asc, desc, eq, gte, isNotNull, lte, ne } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { addDays, toDateKey } from '@/lib/date';

import type { DaySummary } from './stats';

/**
 * Zapis i odczyt nawodnienia. Porcje leżą wiersz po wierszu, a dzień liczymy w strefie telefonu —
 * doba wodna kończy się o północy tam, gdzie się mieszka, a nie w Greenwich.
 */

export type Portion = {
  id: number;
  loggedAt: string;
  milliliters: number;
  source: schema.HydrationSource;
};

/** Zapisuje wypitą porcję. Zwraca identyfikator, żeby dało się ją od razu cofnąć. */
export function logDrink(
  db: SyncDb,
  milliliters: number,
  now: Date = new Date(),
  source: schema.HydrationSource = 'APP',
): number {
  const ml = Math.round(milliliters);
  if (ml <= 0) throw new Error('Porcja musi być większa od zera.');
  return db
    .insert(schema.hydrationLogs)
    .values({ loggedAt: now.toISOString(), dayKey: toDateKey(now), milliliters: ml, source })
    .returning({ id: schema.hydrationLogs.id })
    .get().id;
}

/** Cofa ostatnią porcję dnia. Jedno błędne dotknięcie przy takim przycisku to pewnik. */
export function undoLastDrink(db: SyncDb, dayKey: string): boolean {
  const last = db
    .select({ id: schema.hydrationLogs.id })
    .from(schema.hydrationLogs)
    .where(eq(schema.hydrationLogs.dayKey, dayKey))
    .orderBy(desc(schema.hydrationLogs.loggedAt), desc(schema.hydrationLogs.id))
    .get();
  if (last === undefined) return false;
  db.delete(schema.hydrationLogs).where(eq(schema.hydrationLogs.id, last.id)).run();
  return true;
}

export function removeDrink(db: SyncDb, id: number): void {
  db.delete(schema.hydrationLogs).where(eq(schema.hydrationLogs.id, id)).run();
}

/** Porcje dnia od najwcześniejszej — oś czasu picia. */
export function dayPortions(db: SyncDb, dayKey: string): Portion[] {
  return db
    .select({
      id: schema.hydrationLogs.id,
      loggedAt: schema.hydrationLogs.loggedAt,
      milliliters: schema.hydrationLogs.milliliters,
      source: schema.hydrationLogs.source,
    })
    .from(schema.hydrationLogs)
    .where(eq(schema.hydrationLogs.dayKey, dayKey))
    .orderBy(asc(schema.hydrationLogs.loggedAt), asc(schema.hydrationLogs.id))
    .all();
}

export function consumedOn(db: SyncDb, dayKey: string): number {
  return dayPortions(db, dayKey).reduce((sum, portion) => sum + portion.milliliters, 0);
}

/** Masa ciała z najnowszego pomiaru — podstawa celu dnia. */
export function latestWeightKg(db: SyncDb): number | null {
  return (
    db
      .select({ weightKg: schema.bodyMeasurements.weightKg })
      .from(schema.bodyMeasurements)
      // Pomiar bywa wpisany bez masy — wtedy liczy się poprzedni, który ją ma.
      .where(isNotNull(schema.bodyMeasurements.weightKg))
      .orderBy(desc(schema.bodyMeasurements.measuredOn), desc(schema.bodyMeasurements.id))
      .get()?.weightKg ?? null
  );
}

export function extraOn(db: SyncDb, dayKey: string): number {
  return (
    db
      .select({ extraMl: schema.hydrationDays.extraMl })
      .from(schema.hydrationDays)
      .where(eq(schema.hydrationDays.dayKey, dayKey))
      .get()?.extraMl ?? 0
  );
}

/** Dokłada (albo odejmuje) korektę dnia, nie pozwalając zejść poniżej zera. */
export function addExtra(db: SyncDb, dayKey: string, deltaMl: number): number {
  const next = Math.max(0, extraOn(db, dayKey) + Math.round(deltaMl));
  db.insert(schema.hydrationDays)
    .values({ dayKey, extraMl: next })
    .onConflictDoUpdate({ target: schema.hydrationDays.dayKey, set: { extraMl: next } })
    .run();
  return next;
}

/**
 * Czas zakończonych treningów w podziale na dni. Dzień bierzemy z początku treningu i w strefie
 * telefonu — bieg o 22:30 należy do dnia, w którym się odbył, a nie do następnego.
 */
function trainingSecondsByDay(db: SyncDb, fromKey: string): Map<string, number> {
  const sessions = db
    .select({
      startTime: schema.workoutSessions.startTime,
      endTime: schema.workoutSessions.endTime,
      totalDurationSeconds: schema.workoutSessions.totalDurationSeconds,
    })
    .from(schema.workoutSessions)
    .where(
      and(
        ne(schema.workoutSessions.status, 'IN_PROGRESS'),
        // Dzień wcześniej w zapasie: klucz dnia liczymy lokalnie, a `start_time` jest w UTC.
        gte(schema.workoutSessions.startTime, addDays(fromKey, -1)),
      ),
    )
    .all();

  const byDay = new Map<string, number>();
  for (const session of sessions) {
    const seconds =
      session.totalDurationSeconds ??
      (session.endTime === null
        ? 0
        : Math.max(0, Math.round((Date.parse(session.endTime) - Date.parse(session.startTime)) / 1000)));
    if (seconds <= 0) continue;
    const key = toDateKey(new Date(session.startTime));
    byDay.set(key, (byDay.get(key) ?? 0) + seconds);
  }
  return byDay;
}

/** Ile dziś przetrenowane — do dodatku treningowego w celu dnia. */
export function trainingSecondsOn(db: SyncDb, dayKey: string): number {
  return trainingSecondsByDay(db, dayKey).get(dayKey) ?? 0;
}

/**
 * Kolejne dni od `fromKey` do `toKey`, także te bez ani jednej porcji — puste słupki muszą być
 * widoczne, bo dzień bez picia to właśnie ten, o którym warto wiedzieć.
 */
export function dailySummaries(db: SyncDb, fromKey: string, toKey: string): DaySummary[] {
  const logs = db
    .select({
      dayKey: schema.hydrationLogs.dayKey,
      milliliters: schema.hydrationLogs.milliliters,
    })
    .from(schema.hydrationLogs)
    .where(and(gte(schema.hydrationLogs.dayKey, fromKey), lte(schema.hydrationLogs.dayKey, toKey)))
    .all();

  const drunk = new Map<string, number>();
  for (const log of logs) {
    drunk.set(log.dayKey, (drunk.get(log.dayKey) ?? 0) + log.milliliters);
  }

  const extras = new Map(
    db
      .select({ dayKey: schema.hydrationDays.dayKey, extraMl: schema.hydrationDays.extraMl })
      .from(schema.hydrationDays)
      .where(and(gte(schema.hydrationDays.dayKey, fromKey), lte(schema.hydrationDays.dayKey, toKey)))
      .all()
      .map((row) => [row.dayKey, row.extraMl] as const),
  );

  const training = trainingSecondsByDay(db, fromKey);

  const days: DaySummary[] = [];
  for (let key = fromKey; key <= toKey; key = addDays(key, 1)) {
    days.push({
      dayKey: key,
      milliliters: drunk.get(key) ?? 0,
      trainingSeconds: training.get(key) ?? 0,
      extraMl: extras.get(key) ?? 0,
    });
  }
  return days;
}
