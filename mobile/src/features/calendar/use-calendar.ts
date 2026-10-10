import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { loggedSegments, scheduledWorkouts, workoutPlans, workoutSessions } from '@/db/schema';
import { todayKey } from '@/lib/date';

import { listLogged, listScheduled, type LoggedEntry, type ScheduledEntry } from './repository';

/**
 * Terminy z zakresu dat, przeliczane po każdej zmianie harmonogramu lub nazwy planu.
 * Zapytanie wymaga złączenia i wyliczenia statusu, więc obserwujemy tabele i liczymy listę sami.
 */
export function useScheduledRange(fromKey: string, toKey: string): ScheduledEntry[] {
  const { data: schedule } = useLiveQuery(db.select({ id: scheduledWorkouts.id }).from(scheduledWorkouts));
  const { data: plans } = useLiveQuery(db.select({ title: workoutPlans.title }).from(workoutPlans));

  return useMemo(
    () => listScheduled(db, fromKey, toKey, todayKey()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane pobiera listScheduled
    [schedule, plans, fromKey, toKey],
  );
}

/**
 * Treningi z historii bez terminu — wczytane z zegarka albo prowadzone ad hoc. Obserwujemy też
 * odcinki, bo z nich wychodzi dystans pokazywany w kalendarzu.
 */
export function useLoggedRange(fromKey: string, toKey: string): LoggedEntry[] {
  const { data: sessions } = useLiveQuery(db.select({ id: workoutSessions.id }).from(workoutSessions));
  const { data: segments } = useLiveQuery(db.select({ id: loggedSegments.id }).from(loggedSegments));

  return useMemo(
    () => listLogged(db, fromKey, toKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane pobiera listLogged
    [sessions, segments, fromKey, toKey],
  );
}

/** Treningi z historii pogrupowane po dniu. */
export function groupLoggedByDay(entries: LoggedEntry[]): Map<string, LoggedEntry[]> {
  const byDay = new Map<string, LoggedEntry[]>();
  for (const entry of entries) {
    byDay.set(entry.date, [...(byDay.get(entry.date) ?? []), entry]);
  }
  return byDay;
}

/** Terminy pogrupowane po dniu — do kropek w siatce kalendarza. */
export function groupByDay(entries: ScheduledEntry[]): Map<string, ScheduledEntry[]> {
  const byDay = new Map<string, ScheduledEntry[]>();
  for (const entry of entries) {
    byDay.set(entry.scheduledDate, [...(byDay.get(entry.scheduledDate) ?? []), entry]);
  }
  return byDay;
}
