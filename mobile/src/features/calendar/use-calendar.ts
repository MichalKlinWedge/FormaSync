import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { scheduledWorkouts, workoutPlans } from '@/db/schema';
import { todayKey } from '@/lib/date';

import { listScheduled, type ScheduledEntry } from './repository';

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

/** Terminy pogrupowane po dniu — do kropek w siatce kalendarza. */
export function groupByDay(entries: ScheduledEntry[]): Map<string, ScheduledEntry[]> {
  const byDay = new Map<string, ScheduledEntry[]>();
  for (const entry of entries) {
    byDay.set(entry.scheduledDate, [...(byDay.get(entry.scheduledDate) ?? []), entry]);
  }
  return byDay;
}
