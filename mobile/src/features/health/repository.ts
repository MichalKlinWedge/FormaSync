import { and, asc, desc, eq, gte, ne } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { isEndurance } from '@/features/sports/sport';

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

/**
 * Zdejmuje z treningu pomiary przypisane z zegarka. Kasujemy cały wiersz, a nie samo powiązanie:
 * zostawione tętno i kalorie nadal pochodziłyby z tamtej aktywności, tylko bez śladu skąd.
 * Aktywność wraca wtedy na listę „Z zegarka”.
 */
export function unlinkActivity(db: SyncDb, sessionId: number): void {
  db.delete(schema.garminActivityMetrics)
    .where(eq(schema.garminActivityMetrics.sessionId, sessionId))
    .run();
}

/** Identyfikatory rekordów Health Connect, które już trafiły do historii. */
export function importedActivityIds(db: SyncDb): Set<string> {
  const rows = db
    .select({ id: schema.garminActivityMetrics.garminActivityId })
    .from(schema.garminActivityMetrics)
    .all();
  return new Set(rows.map((row) => row.id).filter((id): id is string => id !== null));
}

/**
 * Okna czasowe treningów zapisanych w aplikacji. Sesja trwająca nie ma jeszcze końca —
 * przyjmujemy wtedy jej początek, żeby nie uznać za pokrywającą się całej doby.
 */
export function sessionWindows(
  db: SyncDb,
  fromIso: string,
): { id: number; title: string; startTime: string; endTime: string }[] {
  return db
    .select({
      id: schema.workoutSessions.id,
      title: schema.workoutSessions.title,
      planTitle: schema.workoutPlans.title,
      startTime: schema.workoutSessions.startTime,
      endTime: schema.workoutSessions.endTime,
    })
    .from(schema.workoutSessions)
    .leftJoin(schema.workoutPlans, eq(schema.workoutSessions.planId, schema.workoutPlans.id))
    .where(gte(schema.workoutSessions.startTime, fromIso))
    .all()
    .map(({ title, planTitle, endTime, ...rest }) => ({
      ...rest,
      title: title ?? planTitle ?? 'Trening',
      endTime: endTime ?? rest.startTime,
    }));
}

/**
 * Treningi, z którymi można połączyć aktywność: zakończone, jeszcze nieprzypisane do żadnej
 * aktywności i z okolic jej daty. Bliżej w czasie znaczy bardziej prawdopodobnie ten sam trening,
 * więc tak je porządkujemy.
 */
export function linkCandidates(
  db: SyncDb,
  aroundIso: string,
  days = 3,
): { id: number; title: string; startTime: string }[] {
  const around = Date.parse(aroundIso);
  const span = days * 24 * 3600 * 1000;
  return db
    .select({
      id: schema.workoutSessions.id,
      title: schema.workoutSessions.title,
      planTitle: schema.workoutPlans.title,
      startTime: schema.workoutSessions.startTime,
      linkedTo: schema.garminActivityMetrics.garminActivityId,
    })
    .from(schema.workoutSessions)
    .leftJoin(schema.workoutPlans, eq(schema.workoutSessions.planId, schema.workoutPlans.id))
    .leftJoin(
      schema.garminActivityMetrics,
      eq(schema.garminActivityMetrics.sessionId, schema.workoutSessions.id),
    )
    .where(ne(schema.workoutSessions.status, 'IN_PROGRESS'))
    .all()
    .filter((row) => row.linkedTo === null && Math.abs(Date.parse(row.startTime) - around) <= span)
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.startTime) - around) - Math.abs(Date.parse(b.startTime) - around),
    )
    .map(({ title, planTitle, linkedTo: _linkedTo, ...rest }) => ({
      ...rest,
      title: title ?? planTitle ?? 'Trening',
    }));
}

/**
 * Dopina pomiary z zegarka do treningu prowadzonego w aplikacji. Serie i powtórzenia zostają
 * te wpisane ręcznie — z zegarka dochodzi wyłącznie to, czego aplikacja sama nie zmierzy.
 */
export function linkActivityToSession(db: SyncDb, sessionId: number, activity: ImportedActivity): void {
  // Dystans z zegarka to też pomiar, którego aplikacja sama nie zrobi — ale dopisujemy go tylko
  // treningowi, który nie ma własnych odcinków. Inaczej policzylibyśmy tę samą trasę dwa razy.
  const sport = db
    .select({ sport: schema.workoutSessions.sport })
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.id, sessionId))
    .get()?.sport;
  const hasSegments =
    db
      .select({ id: schema.loggedSegments.id })
      .from(schema.loggedSegments)
      .where(eq(schema.loggedSegments.sessionId, sessionId))
      .all().length > 0;
  if (sport !== undefined && isEndurance(sport) && !hasSegments) {
    insertMeasuredSegment(db, sessionId, activity);
  }

  db.insert(schema.garminActivityMetrics)
    .values({
      sessionId,
      garminActivityId: activity.recordId,
      avgHeartRate: activity.avgHeartRate,
      maxHeartRate: activity.maxHeartRate,
      caloriesBurned: activity.caloriesBurned,
      rawGarminJson: null,
    })
    .onConflictDoUpdate({
      target: schema.garminActivityMetrics.sessionId,
      set: {
        garminActivityId: activity.recordId,
        avgHeartRate: activity.avgHeartRate,
        maxHeartRate: activity.maxHeartRate,
        caloriesBurned: activity.caloriesBurned,
      },
    })
    .run();
}

/** Aktywności odłożone przez użytkownika — pomijamy je przy kolejnych odczytach. */
export function archivedActivityIds(db: SyncDb): Set<string> {
  return new Set(
    db
      .select({ recordId: schema.archivedActivities.recordId })
      .from(schema.archivedActivities)
      .all()
      .map((row) => row.recordId),
  );
}

export function listArchivedActivities(db: SyncDb): { recordId: string; title: string; startTime: string }[] {
  return db
    .select({
      recordId: schema.archivedActivities.recordId,
      title: schema.archivedActivities.title,
      startTime: schema.archivedActivities.startTime,
    })
    .from(schema.archivedActivities)
    .orderBy(desc(schema.archivedActivities.startTime))
    .all();
}

export function archiveActivity(
  db: SyncDb,
  activity: { recordId: string; title: string; startTime: string },
): void {
  db.insert(schema.archivedActivities)
    .values({ recordId: activity.recordId, title: activity.title, startTime: activity.startTime })
    .onConflictDoNothing({ target: schema.archivedActivities.recordId })
    .run();
}

export function restoreActivity(db: SyncDb, recordId: string): void {
  db.delete(schema.archivedActivities).where(eq(schema.archivedActivities.recordId, recordId)).run();
}

export type ImportedActivity = {
  recordId: string;
  title: string;
  sport: schema.Sport;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  distanceMeters: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesBurned: number | null;
};

/**
 * Zapisuje pokonany dystans jako jeden odcinek roboczy. Zegarek nie dzieli aktywności na odcinki
 * tak, jak robi to plan, ale bez żadnego odcinka trening nie miałby ani dystansu, ani tempa —
 * a to jedyne, co o biegu mówi cokolwiek.
 */
function insertMeasuredSegment(db: SyncDb, sessionId: number, activity: ImportedActivity): void {
  if (activity.distanceMeters === null || activity.distanceMeters <= 0) return;
  const segment = db
    .insert(schema.sessionSegments)
    .values({
      sessionId,
      orderIndex: 0,
      kind: 'WORK',
      durationType: 'DISTANCE',
      distanceMeters: activity.distanceMeters,
      durationSeconds: activity.durationSeconds,
    })
    .returning({ id: schema.sessionSegments.id })
    .get();
  db.insert(schema.loggedSegments)
    .values({
      sessionId,
      sessionSegmentId: segment.id,
      orderIndex: 0,
      iteration: 1,
      distanceMeters: activity.distanceMeters,
      durationSeconds: activity.durationSeconds,
      avgHeartRate: activity.avgHeartRate,
      completedAt: activity.endTime,
    })
    .run();
}

/**
 * Zapisuje aktywność z zegarka jako zakończoną sesję. Serii ani planu Health Connect nie
 * udostępnia, więc w historii pokaże się czas, biometria i — przy bieganiu, rowerze i pływaniu —
 * dystans zapisany jako jeden odcinek.
 */
export function createSessionFromActivity(db: SyncDb, activity: ImportedActivity): number {
  return db.transaction((tx) => {
    const session = tx
      .insert(schema.workoutSessions)
      .values({
        title: activity.title,
        sport: activity.sport,
        status: 'COMPLETED',
        startTime: activity.startTime,
        endTime: activity.endTime,
        totalDurationSeconds: activity.durationSeconds,
      })
      .returning({ id: schema.workoutSessions.id })
      .get();

    if (isEndurance(activity.sport)) insertMeasuredSegment(tx, session.id, activity);

    tx.insert(schema.garminActivityMetrics)
      .values({
        sessionId: session.id,
        garminActivityId: activity.recordId,
        avgHeartRate: activity.avgHeartRate,
        maxHeartRate: activity.maxHeartRate,
        caloriesBurned: activity.caloriesBurned,
        rawGarminJson: null,
      })
      .run();

    return session.id;
  });
}
