import { fromDateKey, toDateKey } from '@/lib/date';

import { dailyTarget } from './target';

/**
 * Tydzień wstecz i seria dowiezionych dni. Cel liczymy osobno dla każdej doby, bo zależy od
 * treningu z tamtego dnia — porównywanie wszystkiego z celem dzisiejszym pokazywałoby dzień
 * z długim biegiem jako nadrobiony, mimo że wtedy wypaść powinno więcej.
 */

export type DaySummary = {
  dayKey: string;
  milliliters: number;
  trainingSeconds: number;
  extraMl: number;
};

export type DayResult = DaySummary & { target: number; met: boolean };

/**
 * Masę ciała bierzemy bieżącą, także dla dni wcześniejszych. Pomiary są rzadkie, a kilogram
 * w tę czy w tę przesuwa cel o trzydzieści mililitrów — mniej niż łyk.
 */
export function withTargets(
  days: DaySummary[],
  weightKg: number | null,
  manualMl: number | null,
): DayResult[] {
  return days.map((day) => {
    const target = dailyTarget({
      weightKg,
      manualMl,
      trainingSeconds: day.trainingSeconds,
      extraMl: day.extraMl,
    }).total;
    return { ...day, target, met: day.milliliters >= target };
  });
}

/**
 * Ile dni z rzędu cel został dowieziony, licząc od dziś w tył. Dzisiejszy dzień, jeszcze
 * niedokończony, serii nie przerywa — inaczej licznik pokazywałby zero przez całe przedpołudnie.
 */
export function currentStreak(days: DayResult[], todayKey: string): number {
  const byDay = new Map(days.map((day) => [day.dayKey, day]));
  const cursor = fromDateKey(todayKey);
  let streak = 0;

  if (byDay.get(todayKey)?.met === true) streak += 1;
  cursor.setDate(cursor.getDate() - 1);

  for (;;) {
    const key = toDateKey(cursor);
    if (byDay.get(key)?.met !== true) return streak;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
}

/** Średnie dzienne spożycie z podanych dni; zero bez danych. */
export function averageMl(days: DaySummary[]): number {
  if (days.length === 0) return 0;
  return Math.round(days.reduce((sum, day) => sum + day.milliliters, 0) / days.length);
}
