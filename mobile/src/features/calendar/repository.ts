import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { Sport } from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { addDays, combineDateAndTime, todayKey, toDateKey } from '@/lib/date';

export type ScheduleStatus = 'COMPLETED' | 'PLANNED' | 'MISSED';

export type ScheduledEntry = {
  id: number;
  planId: number;
  planTitle: string;
  sport: Sport;
  scheduledDate: string;
  scheduledTime: string | null;
  reminderOffsetMinutes: number | null;
  isCompleted: boolean;
  status: ScheduleStatus;
  /** Identyfikator wpisu w kalendarzu Garmina; null, gdy termin tam nie trafił. */
  garminScheduleId: string | null;
  /** Trening przeprowadzony z tego terminu, jeśli już się odbył — prowadzi do jego szczegółów. */
  sessionId: number | null;
};

/** Klucze dat są w formacie YYYY-MM-DD, więc porównanie tekstowe wystarcza. */
export function scheduleStatus(
  entry: { scheduledDate: string; isCompleted: boolean },
  today: string = todayKey(),
): ScheduleStatus {
  if (entry.isCompleted) return 'COMPLETED';
  return entry.scheduledDate < today ? 'MISSED' : 'PLANNED';
}

/** Moment przypomnienia: zaplanowana godzina pomniejszona o wyprzedzenie. */
export function reminderDate(entry: {
  scheduledDate: string;
  scheduledTime: string | null;
  reminderOffsetMinutes: number | null;
}): Date {
  const when = combineDateAndTime(entry.scheduledDate, entry.scheduledTime);
  when.setMinutes(when.getMinutes() - (entry.reminderOffsetMinutes ?? 0));
  return when;
}

export function listScheduled(db: SyncDb, fromKey: string, toKey: string, today = todayKey()): ScheduledEntry[] {
  return db
    .select({
      id: schema.scheduledWorkouts.id,
      planId: schema.scheduledWorkouts.planId,
      planTitle: schema.workoutPlans.title,
      sport: schema.workoutPlans.sport,
      scheduledDate: schema.scheduledWorkouts.scheduledDate,
      scheduledTime: schema.scheduledWorkouts.scheduledTime,
      reminderOffsetMinutes: schema.scheduledWorkouts.reminderOffsetMinutes,
      isCompleted: schema.scheduledWorkouts.isCompleted,
      garminScheduleId: schema.scheduledWorkouts.garminScheduleId,
      // Z jednego terminu może zostać kilka podejść; prowadzimy do ostatniego.
      sessionId: sql<number | null>`max(${schema.workoutSessions.id})`,
    })
    .from(schema.scheduledWorkouts)
    .innerJoin(schema.workoutPlans, eq(schema.scheduledWorkouts.planId, schema.workoutPlans.id))
    .leftJoin(
      schema.workoutSessions,
      eq(schema.workoutSessions.scheduledId, schema.scheduledWorkouts.id),
    )
    .where(
      and(
        gte(schema.scheduledWorkouts.scheduledDate, fromKey),
        lte(schema.scheduledWorkouts.scheduledDate, toKey),
      ),
    )
    .groupBy(schema.scheduledWorkouts.id)
    .orderBy(asc(schema.scheduledWorkouts.scheduledDate), asc(schema.scheduledWorkouts.scheduledTime))
    .all()
    .map((row) => ({ ...row, status: scheduleStatus(row, today) }));
}

/** Jeden termin po identyfikatorze — do ekranu szczegółów. */
export function loadScheduled(db: SyncDb, id: number, today = todayKey()): ScheduledEntry | null {
  const row = db
    .select({
      id: schema.scheduledWorkouts.id,
      planId: schema.scheduledWorkouts.planId,
      planTitle: schema.workoutPlans.title,
      sport: schema.workoutPlans.sport,
      scheduledDate: schema.scheduledWorkouts.scheduledDate,
      scheduledTime: schema.scheduledWorkouts.scheduledTime,
      reminderOffsetMinutes: schema.scheduledWorkouts.reminderOffsetMinutes,
      isCompleted: schema.scheduledWorkouts.isCompleted,
      garminScheduleId: schema.scheduledWorkouts.garminScheduleId,
      sessionId: sql<number | null>`max(${schema.workoutSessions.id})`,
    })
    .from(schema.scheduledWorkouts)
    .innerJoin(schema.workoutPlans, eq(schema.scheduledWorkouts.planId, schema.workoutPlans.id))
    .leftJoin(schema.workoutSessions, eq(schema.workoutSessions.scheduledId, schema.scheduledWorkouts.id))
    .where(eq(schema.scheduledWorkouts.id, id))
    .groupBy(schema.scheduledWorkouts.id)
    .get();
  return row ? { ...row, status: scheduleStatus(row, today) } : null;
}

/**
 * Treningi, które można przypisać do terminu: tej samej dyscypliny, zakończone, jeszcze
 * nieprzypisane do żadnego terminu i z okolic jego daty. Bliżej w czasie znaczy bardziej
 * prawdopodobnie ten sam trening, więc tak je porządkujemy.
 *
 * Dyscyplina jest wymagana, a nie opcjonalna: bieg nigdy nie jest tym samym treningiem co
 * pływanie, a pomyłka podstawia pod termin cudzy trening i oznacza go jako wykonany.
 */
export function sessionsToAttach(
  db: SyncDb,
  scheduledDate: string,
  sport: Sport,
  days = 3,
): { id: number; title: string; startTime: string }[] {
  const around = Date.parse(combineDateAndTime(scheduledDate, null).toISOString());
  const span = days * 24 * 3600 * 1000;
  return db
    .select({
      id: schema.workoutSessions.id,
      title: schema.workoutSessions.title,
      planTitle: schema.workoutPlans.title,
      startTime: schema.workoutSessions.startTime,
      scheduledId: schema.workoutSessions.scheduledId,
      status: schema.workoutSessions.status,
      sport: schema.workoutSessions.sport,
    })
    .from(schema.workoutSessions)
    .leftJoin(schema.workoutPlans, eq(schema.workoutSessions.planId, schema.workoutPlans.id))
    .all()
    .filter(
      (row) =>
        row.scheduledId === null &&
        row.status !== 'IN_PROGRESS' &&
        row.sport === sport &&
        Math.abs(Date.parse(row.startTime) - around) <= span,
    )
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.startTime) - around) - Math.abs(Date.parse(b.startTime) - around),
    )
    .map(({ title, planTitle, scheduledId: _s, status: _st, sport: _sp, ...rest }) => ({
      ...rest,
      title: title ?? planTitle ?? 'Trening',
    }));
}

/**
 * Wolne terminy danego dnia w danej dyscyplinie — te, do których można przypisać trening
 * przychodzący z zegarka. Termin z już przypisanym treningiem pomijamy, żeby jedno kliknięcie
 * nie podmieniło cudzego wpisu.
 */
export function openTermsOn(
  db: SyncDb,
  dateKey: string,
  sport: Sport,
): { id: number; title: string; scheduledTime: string | null }[] {
  return db
    .select({
      id: schema.scheduledWorkouts.id,
      title: schema.workoutPlans.title,
      scheduledTime: schema.scheduledWorkouts.scheduledTime,
      sessionId: sql<number | null>`max(${schema.workoutSessions.id})`,
    })
    .from(schema.scheduledWorkouts)
    .innerJoin(schema.workoutPlans, eq(schema.scheduledWorkouts.planId, schema.workoutPlans.id))
    .leftJoin(schema.workoutSessions, eq(schema.workoutSessions.scheduledId, schema.scheduledWorkouts.id))
    .where(
      and(eq(schema.scheduledWorkouts.scheduledDate, dateKey), eq(schema.workoutPlans.sport, sport)),
    )
    .groupBy(schema.scheduledWorkouts.id)
    .orderBy(asc(schema.scheduledWorkouts.scheduledTime))
    .all()
    .filter((row) => row.sessionId === null)
    .map(({ sessionId: _s, ...rest }) => rest);
}

/**
 * Przypisuje przeprowadzony trening do terminu. Termin zrealizowany ukończonym treningiem
 * oznaczamy jako wykonany — tak samo, jak robi to zakończenie treningu startowanego z kalendarza.
 */
export function attachSession(db: SyncDb, scheduledId: number, sessionId: number): void {
  db.transaction((tx) => {
    const session = tx
      .select({ status: schema.workoutSessions.status })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, sessionId))
      .get();
    if (!session) return;

    tx.update(schema.workoutSessions)
      .set({ scheduledId })
      .where(eq(schema.workoutSessions.id, sessionId))
      .run();
    tx.update(schema.scheduledWorkouts)
      .set({ isCompleted: session.status === 'COMPLETED' })
      .where(eq(schema.scheduledWorkouts.id, scheduledId))
      .run();
  });
}

/**
 * Trening wczytany na termin przejmuje jego plan. Aktywność z zegarka przychodzi z nazwą nadaną
 * przez Garmina — „Kardio”, „Trening siłowy” — a w kalendarzu stało „Taniec 60 minut”. To termin
 * mówi, co to było za zajęcie; zegarek wie tylko, jak je zmierzył.
 *
 * Własnego tytułu nie ruszamy: nazwa wpisana ręcznie jest decyzją użytkownika, nie etykietą
 * z zewnątrz.
 */
export function adoptTermPlan(db: SyncDb, sessionId: number, scheduledId: number): void {
  const term = db
    .select({ planId: schema.scheduledWorkouts.planId })
    .from(schema.scheduledWorkouts)
    .where(eq(schema.scheduledWorkouts.id, scheduledId))
    .get();
  if (!term) return;

  db.update(schema.workoutSessions)
    .set({ planId: term.planId, title: null })
    .where(eq(schema.workoutSessions.id, sessionId))
    .run();
}

/** Odpina trening od terminu. Sam trening zostaje w historii nietknięty. */
export function detachSession(db: SyncDb, sessionId: number): void {
  db.transaction((tx) => {
    const session = tx
      .select({ scheduledId: schema.workoutSessions.scheduledId })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, sessionId))
      .get();
    if (!session?.scheduledId) return;

    tx.update(schema.workoutSessions)
      .set({ scheduledId: null })
      .where(eq(schema.workoutSessions.id, sessionId))
      .run();
    tx.update(schema.scheduledWorkouts)
      .set({ isCompleted: false })
      .where(eq(schema.scheduledWorkouts.id, session.scheduledId))
      .run();
  });
}

export type ScheduleInput = {
  planId: number;
  dates: string[];
  scheduledTime: string | null;
  reminderOffsetMinutes: number | null;
};

/**
 * Wpisuje plan na wskazane dni. Termin już istniejący dla tej pary plan–dzień jest pomijany,
 * żeby cykl nachodzący na wcześniejsze wpisy nie tworzył duplikatów. Zwraca liczbę dodanych.
 */
export function scheduleWorkouts(db: SyncDb, input: ScheduleInput): number {
  if (input.dates.length === 0) return 0;
  return db.transaction((tx) => {
    const existing = new Set(
      tx
        .select({ date: schema.scheduledWorkouts.scheduledDate })
        .from(schema.scheduledWorkouts)
        .where(
          and(
            eq(schema.scheduledWorkouts.planId, input.planId),
            inArray(schema.scheduledWorkouts.scheduledDate, input.dates),
          ),
        )
        .all()
        .map((r) => r.date),
    );
    const fresh = [...new Set(input.dates)].filter((date) => !existing.has(date));
    if (fresh.length === 0) return 0;

    tx.insert(schema.scheduledWorkouts)
      .values(
        fresh.map((scheduledDate) => ({
          planId: input.planId,
          scheduledDate,
          scheduledTime: input.scheduledTime,
          reminderOffsetMinutes: input.reminderOffsetMinutes,
        })),
      )
      .run();
    return fresh.length;
  });
}

export type ScheduleEdit = {
  scheduledDate: string;
  scheduledTime: string | null;
  reminderOffsetMinutes: number | null;
};

/** Termin zajęty przez ten sam plan w innym dniu — przeniesienie na niego zlałoby dwa wpisy w jeden. */
export class ScheduleConflictError extends Error {
  constructor() {
    super('Ten plan jest już zaplanowany na ten dzień.');
  }
}

/**
 * Przesuwa termin na inny dzień albo godzinę. Powiadomienie trzeba potem przeliczyć od nowa —
 * jego identyfikator czyścimy, bo stare przypomnienie wskazuje nieaktualną porę.
 *
 * Zwraca poprzedni dzień terminu, żeby wywołujący wiedział, czy wpis w kalendarzu Garmina
 * wymaga przeniesienia. `null`, gdy terminu nie było.
 */
export function updateScheduled(db: SyncDb, id: number, edit: ScheduleEdit): string | null {
  return db.transaction((tx) => {
    const entry = tx
      .select({
        planId: schema.scheduledWorkouts.planId,
        scheduledDate: schema.scheduledWorkouts.scheduledDate,
      })
      .from(schema.scheduledWorkouts)
      .where(eq(schema.scheduledWorkouts.id, id))
      .get();
    if (!entry) return null;

    const clash = tx
      .select({ id: schema.scheduledWorkouts.id })
      .from(schema.scheduledWorkouts)
      .where(
        and(
          eq(schema.scheduledWorkouts.planId, entry.planId),
          eq(schema.scheduledWorkouts.scheduledDate, edit.scheduledDate),
          ne(schema.scheduledWorkouts.id, id),
        ),
      )
      .get();
    if (clash) throw new ScheduleConflictError();

    // Kalendarz Garmina zna tylko dzień, więc sama zmiana godziny go nie dotyczy i ślad zostaje.
    // Przy zmianie dnia stary wpis przestaje pasować: ślad zdejmujemy tutaj, a przeniesienie
    // u Garmina robi osobny krok, który po udanej wysyłce zapisze nowy numer.
    const movedDay = entry.scheduledDate !== edit.scheduledDate;
    tx.update(schema.scheduledWorkouts)
      .set({
        ...edit,
        notificationId: null,
        ...(movedDay ? { garminSynced: false, garminScheduleId: null } : {}),
      })
      .where(eq(schema.scheduledWorkouts.id, id))
      .run();
    return entry.scheduledDate;
  });
}

/** Zapamiętuje, że termin trafił do kalendarza Garmina — po tym poznajemy, co tam zdjąć. */
export function setGarminSchedule(
  db: SyncDb,
  id: number,
  garmin: { workoutId: number; scheduleId: number | null },
): void {
  db.update(schema.scheduledWorkouts)
    .set({
      garminSynced: true,
      garminWorkoutId: String(garmin.workoutId),
      garminScheduleId: garmin.scheduleId === null ? null : String(garmin.scheduleId),
    })
    .where(eq(schema.scheduledWorkouts.id, id))
    .run();
}

/** Zdejmuje ślad po kalendarzu Garmina; sam trening zostaje w jego bibliotece. */
export function clearGarminSchedule(db: SyncDb, id: number): void {
  db.update(schema.scheduledWorkouts)
    .set({ garminSynced: false, garminScheduleId: null })
    .where(eq(schema.scheduledWorkouts.id, id))
    .run();
}

export function deleteScheduled(db: SyncDb, id: number): void {
  db.delete(schema.scheduledWorkouts).where(eq(schema.scheduledWorkouts.id, id)).run();
}

/** Terminy do przypomnienia: niezrealizowane i z przyszłym momentem powiadomienia. */
export function listPendingReminders(db: SyncDb, now: Date = new Date()) {
  return db
    .select({
      id: schema.scheduledWorkouts.id,
      planTitle: schema.workoutPlans.title,
      sport: schema.workoutPlans.sport,
      scheduledDate: schema.scheduledWorkouts.scheduledDate,
      scheduledTime: schema.scheduledWorkouts.scheduledTime,
      reminderOffsetMinutes: schema.scheduledWorkouts.reminderOffsetMinutes,
    })
    .from(schema.scheduledWorkouts)
    .innerJoin(schema.workoutPlans, eq(schema.scheduledWorkouts.planId, schema.workoutPlans.id))
    .where(eq(schema.scheduledWorkouts.isCompleted, false))
    .all()
    .map((row) => ({ ...row, remindAt: reminderDate(row) }))
    .filter((row) => row.remindAt.getTime() > now.getTime());
}

export function setReminderNotificationId(db: SyncDb, scheduledId: number, notificationId: string | null): void {
  db.update(schema.scheduledWorkouts)
    .set({ notificationId })
    .where(eq(schema.scheduledWorkouts.id, scheduledId))
    .run();
}

/** Trening z historii bez terminu w kalendarzu — wczytany z zegarka albo prowadzony ad hoc. */
export type LoggedEntry = {
  sessionId: number;
  date: string;
  title: string;
  sport: schema.Sport;
  meters: number;
  seconds: number;
};

/**
 * Treningi, które się odbyły, ale nie mają terminu. Kalendarz pokazywał dotąd wyłącznie plany,
 * więc rok historii ściągnięty z zegarka był widoczny tylko na liście w Historii — a właśnie
 * w siatce miesiąca widać rytm tygodnia, przerwy i to, czy objętość rosła.
 *
 * Dzień liczymy w strefie telefonu, dlatego zakres w zapytaniu bierzemy z dobą zapasu i dopiero
 * potem przycinamy po wyliczonym kluczu dnia.
 */
export function listLogged(db: SyncDb, fromKey: string, toKey: string): LoggedEntry[] {
  const sessions = db
    .select({
      sessionId: schema.workoutSessions.id,
      startTime: schema.workoutSessions.startTime,
      title: schema.workoutSessions.title,
      planTitle: schema.workoutPlans.title,
      sport: schema.workoutSessions.sport,
      totalDurationSeconds: schema.workoutSessions.totalDurationSeconds,
    })
    .from(schema.workoutSessions)
    .leftJoin(schema.workoutPlans, eq(schema.workoutSessions.planId, schema.workoutPlans.id))
    .where(
      and(
        ne(schema.workoutSessions.status, 'IN_PROGRESS'),
        isNull(schema.workoutSessions.scheduledId),
        gte(schema.workoutSessions.startTime, addDays(fromKey, -1)),
        lte(schema.workoutSessions.startTime, `${addDays(toKey, 1)}T23:59:59.999Z`),
      ),
    )
    .all();

  if (sessions.length === 0) return [];

  const segments = db
    .select({
      sessionId: schema.loggedSegments.sessionId,
      distanceMeters: schema.loggedSegments.distanceMeters,
      durationSeconds: schema.loggedSegments.durationSeconds,
    })
    .from(schema.loggedSegments)
    .where(isNotNull(schema.loggedSegments.completedAt))
    .all();

  const totals = new Map<number, { meters: number; seconds: number }>();
  for (const segment of segments) {
    const current = totals.get(segment.sessionId) ?? { meters: 0, seconds: 0 };
    totals.set(segment.sessionId, {
      meters: current.meters + (segment.distanceMeters ?? 0),
      seconds: current.seconds + (segment.durationSeconds ?? 0),
    });
  }

  return sessions
    .map((session) => {
      const total = totals.get(session.sessionId) ?? { meters: 0, seconds: 0 };
      return {
        sessionId: session.sessionId,
        date: toDateKey(new Date(session.startTime)),
        title: session.title ?? session.planTitle ?? 'Trening',
        sport: session.sport,
        meters: Math.round(total.meters),
        seconds: total.seconds > 0 ? total.seconds : (session.totalDurationSeconds ?? 0),
      };
    })
    .filter((entry) => entry.date >= fromKey && entry.date <= toKey)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sessionId - b.sessionId);
}
