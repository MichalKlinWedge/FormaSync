import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { bodyMeasurements, hydrationDays, hydrationLogs, workoutSessions } from '@/db/schema';
import { addDays } from '@/lib/date';

import {
  consumedOn,
  dailySummaries,
  dayPortions,
  extraOn,
  latestWeightKg,
  trainingSecondsOn,
  type Portion,
} from './repository';
import { loadHydrationSettings, type HydrationSettings } from './settings';
import { currentStreak, withTargets, type DayResult } from './stats';
import { dailyTarget, type DailyTarget } from './target';

export type HydrationDay = {
  consumed: number;
  target: DailyTarget;
  portions: Portion[];
  settings: HydrationSettings;
};

/**
 * Stan nawodnienia dnia, przeliczany po każdej wypitej porcji.
 *
 * Obserwujemy cztery tabele, bo cel zależy nie tylko od wypitego: dochodzi korekta dnia,
 * masa ciała z pomiarów i czas dzisiejszych treningów. Bez sygnału z sesji kafelek nie
 * zauważyłby dodatku za trening zakończony chwilę wcześniej.
 */
export function useHydrationDay(dayKey: string): HydrationDay {
  const { data: logs } = useLiveQuery(db.select({ id: hydrationLogs.id }).from(hydrationLogs));
  const { data: extras } = useLiveQuery(db.select({ dayKey: hydrationDays.dayKey }).from(hydrationDays));
  const { data: weights } = useLiveQuery(db.select({ id: bodyMeasurements.id }).from(bodyMeasurements));
  const { data: sessions } = useLiveQuery(db.select({ id: workoutSessions.id }).from(workoutSessions));

  return useMemo(() => {
    const settings = loadHydrationSettings(db);
    return {
      consumed: consumedOn(db, dayKey),
      portions: dayPortions(db, dayKey),
      settings,
      target: dailyTarget({
        weightKg: latestWeightKg(db),
        manualMl: settings.manualMl,
        trainingSeconds: trainingSecondsOn(db, dayKey),
        extraMl: extraOn(db, dayKey),
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnały zmiany, dane czytają funkcje repozytorium
  }, [logs, extras, weights, sessions, dayKey]);
}

export type HydrationHistory = { days: DayResult[]; streak: number };

/** Ostatnie `days` dni z celem policzonym osobno na każdy dzień, razem z serią dowiezionych. */
export function useHydrationHistory(todayKey: string, days = 7): HydrationHistory {
  const { data: logs } = useLiveQuery(db.select({ id: hydrationLogs.id }).from(hydrationLogs));
  const { data: extras } = useLiveQuery(db.select({ dayKey: hydrationDays.dayKey }).from(hydrationDays));
  const { data: sessions } = useLiveQuery(db.select({ id: workoutSessions.id }).from(workoutSessions));

  return useMemo(() => {
    const settings = loadHydrationSettings(db);
    // Serię liczymy z szerszego okna niż pokazane słupki — inaczej urwałaby się na siódmym dniu.
    const summaries = dailySummaries(db, addDays(todayKey, -89), todayKey);
    const results = withTargets(summaries, latestWeightKg(db), settings.manualMl);
    return { days: results.slice(-days), streak: currentStreak(results, todayKey) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnały zmiany, dane czytają funkcje repozytorium
  }, [logs, extras, sessions, todayKey, days]);
}
