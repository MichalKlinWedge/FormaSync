import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { bodyMeasurements, loggedSets } from '@/db/schema';

import type { CompletedSet } from './analytics';
import { type BodyMeasurement, listMeasurements, loadCompletedSets } from './repository';

/** Wykonane serie, przeładowywane po każdej zmianie w dzienniku. */
export function useCompletedSets(): CompletedSet[] {
  const { data: signal } = useLiveQuery(db.select({ id: loggedSets.id }).from(loggedSets));
  return useMemo(
    () => loadCompletedSets(db),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane pobiera loadCompletedSets
    [signal],
  );
}

export function useMeasurements(): BodyMeasurement[] {
  const { data: signal } = useLiveQuery(db.select({ id: bodyMeasurements.id }).from(bodyMeasurements));
  return useMemo(
    () => listMeasurements(db),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane pobiera listMeasurements
    [signal],
  );
}
