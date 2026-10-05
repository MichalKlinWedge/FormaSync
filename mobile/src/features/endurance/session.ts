import { and, asc, eq, isNotNull } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

import { paceFrom } from './format';

/**
 * Trening wytrzymałościowy w trakcie: lista odcinków do pokonania w kolejności biegu,
 * każdy z celem z planu i miejscem na to, co faktycznie wyszło.
 */

export type ActiveSegment = {
  /** Wiersz wykonania — to jego zapisujemy. */
  id: number;
  orderIndex: number;
  iteration: number;
  kind: schema.SegmentKind;
  /** Która iteracja z ilu; 1 z 1 dla odcinków poza grupą powtórzeń. */
  totalIterations: number;
  durationType: schema.DurationType;
  targetDistanceMeters: number | null;
  targetDurationSeconds: number | null;
  targetType: schema.TargetType;
  targetLow: number | null;
  targetHigh: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  avgHeartRate: number | null;
  completedAt: string | null;
};

export type ActiveEnduranceSession = {
  id: number;
  title: string | null;
  sport: schema.Sport;
  startTime: string;
  segments: ActiveSegment[];
};

export function loadEnduranceSession(db: SyncDb, sessionId: number): ActiveEnduranceSession | null {
  const session = db
    .select()
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.id, sessionId))
    .get();
  if (!session) return null;

  const segments = db
    .select()
    .from(schema.sessionSegments)
    .where(eq(schema.sessionSegments.sessionId, sessionId))
    .all();
  const byId = new Map(segments.map((segment) => [segment.id, segment]));

  const rows = db
    .select()
    .from(schema.loggedSegments)
    .where(eq(schema.loggedSegments.sessionId, sessionId))
    .orderBy(asc(schema.loggedSegments.orderIndex))
    .all();

  return {
    id: session.id,
    title: session.title,
    sport: session.sport,
    startTime: session.startTime,
    segments: rows.flatMap((row) => {
      const segment = byId.get(row.sessionSegmentId);
      if (!segment) return [];
      const parent = segment.parentId === null ? null : (byId.get(segment.parentId) ?? null);
      return [
        {
          id: row.id,
          orderIndex: row.orderIndex,
          iteration: row.iteration,
          kind: segment.kind,
          totalIterations: parent?.repeatCount ?? 1,
          durationType: segment.durationType,
          targetDistanceMeters: segment.distanceMeters,
          targetDurationSeconds: segment.durationSeconds,
          targetType: segment.targetType,
          targetLow: segment.targetLow,
          targetHigh: segment.targetHigh,
          distanceMeters: row.distanceMeters,
          durationSeconds: row.durationSeconds,
          avgHeartRate: row.avgHeartRate,
          completedAt: row.completedAt,
        },
      ];
    }),
  };
}

export type SegmentValues = {
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  avgHeartRate?: number | null;
};

/**
 * Zapisuje wykonanie odcinka. Dystans bierzemy z planu, jeśli nikt go nie poprawił, a czas
 * mierzymy zegarem — od zatwierdzenia poprzedniego odcinka, a dla pierwszego od startu treningu.
 * Bez tego odcinek na dystans nie miałby czasu, a więc i tempa, czyli głównej liczby w bieganiu.
 */
export function completeSegment(
  db: SyncDb,
  loggedSegmentId: number,
  values: SegmentValues,
  now = new Date().toISOString(),
): void {
  const row = db
    .select()
    .from(schema.loggedSegments)
    .where(eq(schema.loggedSegments.id, loggedSegmentId))
    .get();
  if (!row) throw new Error(`Odcinek ${loggedSegmentId} nie istnieje`);

  const segment = db
    .select()
    .from(schema.sessionSegments)
    .where(eq(schema.sessionSegments.id, row.sessionSegmentId))
    .get();

  db.update(schema.loggedSegments)
    .set({
      distanceMeters: values.distanceMeters ?? row.distanceMeters ?? segment?.distanceMeters ?? null,
      durationSeconds:
        values.durationSeconds ??
        row.durationSeconds ??
        measuredSeconds(db, row.sessionId, now) ??
        segment?.durationSeconds ??
        null,
      avgHeartRate: values.avgHeartRate ?? row.avgHeartRate ?? null,
      completedAt: now,
    })
    .where(eq(schema.loggedSegments.id, loggedSegmentId))
    .run();
}

/** Czas od zatwierdzenia poprzedniego odcinka; dla pierwszego — od startu treningu. */
function measuredSeconds(db: SyncDb, sessionId: number, now: string): number | null {
  const session = db
    .select({ startTime: schema.workoutSessions.startTime })
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.id, sessionId))
    .get();
  if (!session) return null;

  const previous = db
    .select({ completedAt: schema.loggedSegments.completedAt })
    .from(schema.loggedSegments)
    .where(and(eq(schema.loggedSegments.sessionId, sessionId), isNotNull(schema.loggedSegments.completedAt)))
    .all()
    .map((item) => item.completedAt)
    .filter((at): at is string => at !== null)
    .sort()
    .at(-1);

  const from = Date.parse(previous ?? session.startTime);
  const seconds = Math.round((Date.parse(now) - from) / 1000);
  // Dwa dotknięcia w tej samej sekundzie dałyby zero, co popsułoby tempo.
  return seconds > 0 ? seconds : null;
}

/** Cofa zapis odcinka — pomyłka przy szybkim klikaniu w biegu zdarza się często. */
export function uncompleteSegment(db: SyncDb, loggedSegmentId: number): void {
  db.update(schema.loggedSegments)
    .set({ completedAt: null })
    .where(eq(schema.loggedSegments.id, loggedSegmentId))
    .run();
}

export function updateSegmentValues(db: SyncDb, loggedSegmentId: number, values: SegmentValues): void {
  db.update(schema.loggedSegments).set(values).where(eq(schema.loggedSegments.id, loggedSegmentId)).run();
}

/** Podsumowanie wykonanych odcinków — dystans i czas treningu. */
export function sessionTotals(segments: ActiveSegment[]): { meters: number; seconds: number } {
  return sumSegments(segments.filter((segment) => segment.completedAt !== null));
}

/** Dystans i czas samych odcinków pracy — bez rozgrzewki, przerw i schłodzenia. */
export function workTotals(segments: ActiveSegment[]): { meters: number; seconds: number } {
  return sumSegments(
    segments.filter((segment) => segment.completedAt !== null && segment.kind === 'WORK'),
  );
}

function sumSegments(segments: ActiveSegment[]): { meters: number; seconds: number } {
  return segments.reduce(
    (sum, segment) => ({
      meters: sum.meters + (segment.distanceMeters ?? 0),
      seconds: sum.seconds + (segment.durationSeconds ?? 0),
    }),
    { meters: 0, seconds: 0 },
  );
}

/**
 * Dwa tempa, bo opisują co innego. Tempo całości dzieli cały dystans przez cały czas, więc
 * rozgrzewka i przerwy je spowalniają — pasuje do porównania całych treningów. Tempo pracy
 * liczy tylko odcinki robocze i mówi, jak szybko biegło się wtedy, gdy miało być szybko.
 */
export function paceBreakdown(segments: ActiveSegment[]): { overall: number | null; work: number | null } {
  const all = sessionTotals(segments);
  const work = workTotals(segments);
  return {
    overall: paceFrom(all.meters, all.seconds),
    work: paceFrom(work.meters, work.seconds),
  };
}
