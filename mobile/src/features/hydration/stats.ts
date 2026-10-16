import { fromDateKey, toDateKey } from '@/lib/date';
import { pluralWith } from '@/lib/number';

import { formatMl } from './format';

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

export type HydrationSummary = {
  /** Dni z jakimkolwiek zapisem picia. */
  days: number;
  /** Dni, w których cel został dowieziony. */
  metDays: number;
  avgMl: number | null;
  avgTargetMl: number | null;
};

/**
 * Podsumowanie kilku dni picia.
 *
 * Liczymy wyłącznie dni z jakimkolwiek zapisem — tak samo jak przy jedzeniu. Dzień bez ani jednej
 * porcji nie znaczy, że nic się nie piło; znaczy, że nikt tego nie zapisał, a wliczony zaniżałby
 * średnią o połowę i pokazywał odwodnienie, którego nie było.
 */
export function summarizeHydration(days: DayResult[]): HydrationSummary {
  const logged = days.filter((day) => day.milliliters > 0);
  const mean = (values: number[]): number | null =>
    values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  return {
    days: logged.length,
    metDays: logged.filter((day) => day.met).length,
    avgMl: mean(logged.map((day) => day.milliliters)),
    avgTargetMl: mean(logged.map((day) => day.target)),
  };
}

/** Okres jednym zdaniem: ile średnio przy jakim celu i jak często cel był dowieziony. */
export function describeHydration(summary: HydrationSummary): string {
  if (summary.days === 0 || summary.avgMl === null || summary.avgTargetMl === null) {
    return 'Z tych dni nie ma ani jednego zapisu picia.';
  }

  const met = `${summary.metDays} z ${pluralWith(summary.days, 'dnia', 'dni', 'dni')}`;
  return `Średnio ${formatMl(summary.avgMl)} przy celu ${formatMl(summary.avgTargetMl)}`
    + ` — cel dowieziony w ${met}.`;
}
