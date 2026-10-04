import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { combineDateAndTime, todayKey } from '@/lib/date';

export type ScheduleStatus = 'COMPLETED' | 'PLANNED' | 'MISSED';

export type ScheduledEntry = {
  id: number;
  planId: number;
  planTitle: string;
  scheduledDate: string;
  scheduledTime: string | null;
  reminderOffsetMinutes: number | null;
  isCompleted: boolean;
  status: ScheduleStatus;
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
      scheduledDate: schema.scheduledWorkouts.scheduledDate,
      scheduledTime: schema.scheduledWorkouts.scheduledTime,
      reminderOffsetMinutes: schema.scheduledWorkouts.reminderOffsetMinutes,
      isCompleted: schema.scheduledWorkouts.isCompleted,
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

export function deleteScheduled(db: SyncDb, id: number): void {
  db.delete(schema.scheduledWorkouts).where(eq(schema.scheduledWorkouts.id, id)).run();
}

/** Terminy do przypomnienia: niezrealizowane i z przyszłym momentem powiadomienia. */
export function listPendingReminders(db: SyncDb, now: Date = new Date()) {
  return db
    .select({
      id: schema.scheduledWorkouts.id,
      planTitle: schema.workoutPlans.title,
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
