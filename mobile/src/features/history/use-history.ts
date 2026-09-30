import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { loggedSets, workoutSessions } from '@/db/schema';

import { groupByMonth } from '@/lib/date';
import { type HistoryEntry, listHistory } from './repository';

/**
 * Lista historii przeliczana po każdej zmianie sesji lub serii. Zapytanie zbiorcze wymaga
 * kilku złączeń, więc obserwujemy tabele i przeliczamy listę, zamiast wiązać widok z jednym SELECT-em.
 */
export function useHistory(): { label: string; items: HistoryEntry[] }[] {
  const { data: sessions } = useLiveQuery(db.select({ id: workoutSessions.id }).from(workoutSessions));
  const { data: sets } = useLiveQuery(db.select({ id: loggedSets.id }).from(loggedSets));

  return useMemo(
    () => groupByMonth(listHistory(db), (entry) => entry.startTime),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane pobiera listHistory
    [sessions, sets],
  );
}
