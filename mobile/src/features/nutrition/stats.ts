import { formatNumber } from '@/lib/number';

import { formatKcal } from './format';
import { KCAL_PER_KG } from './goal';

/**
 * Podsumowanie kilku dni jedzenia: ile weszło, ile miało wejść i co z tego wynika dla masy ciała.
 *
 * Liczymy wyłącznie dni, które mają zapisane jedzenie. Dzień bez wpisu nie jest dniem o zerowym
 * spożyciu — jest dniem, o którym nic nie wiadomo, i wliczanie go zaniżałoby wszystko po kolei.
 */

export type DayStat = {
  dayKey: string;
  kcal: number;
  proteinG: number;
  /** Kalorie treningów tego dnia — budżet rośnie o nie, więc widać je osobno. */
  trainingKcal: number;
  meals: number;
  /** Budżet tego dnia; null, gdy brakuje danych do wzoru. */
  target: number | null;
};

export type Summary = {
  /** Dni z jakimkolwiek wpisem jedzenia. */
  days: number;
  avgIntake: number | null;
  avgTarget: number | null;
  avgProtein: number | null;
  /** Średnia dzienna różnica między zjedzonym a budżetem; dodatnia, gdy ponad budżet. */
  balance: number | null;
  overDays: number;
  underDays: number;
};

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

export function summarize(days: DayStat[]): Summary {
  const logged = days.filter((day) => day.meals > 0);
  const withTarget = logged.filter((day) => day.target !== null);
  const diffs = withTarget.map((day) => day.kcal - (day.target as number));

  return {
    days: logged.length,
    avgIntake: mean(logged.map((day) => day.kcal)),
    avgTarget: mean(withTarget.map((day) => day.target as number)),
    avgProtein: mean(logged.map((day) => day.proteinG)),
    balance: mean(diffs),
    overDays: diffs.filter((diff) => diff > 0).length,
    underDays: diffs.filter((diff) => diff < 0).length,
  };
}

/** Ile kilogramów na tydzień wychodzi z takiego bilansu. */
export const weeklyChange = (balance: number): number => (balance * 7) / KCAL_PER_KG;

/**
 * Bilans okresu jednym zdaniem, razem z tym, dokąd prowadzi. Sama różnica kalorii nic nie mówi —
 * dopiero przełożona na kilogramy na tydzień da się porównać z celem.
 */
export function describeBalance(summary: Summary): string {
  if (summary.days === 0) return 'Z tych dni nie ma ani jednego wpisu.';
  if (summary.avgIntake === null) return 'Z tych dni nie ma ani jednego wpisu.';
  if (summary.balance === null || summary.avgTarget === null) {
    return `Średnio ${formatKcal(summary.avgIntake)} dziennie przez ${summary.days} dni. Budżetu nie znamy, więc nie ma do czego tego przyłożyć.`;
  }

  const sentence = `Średnio ${formatKcal(summary.avgIntake)} przy budżecie ${formatKcal(summary.avgTarget)}`;
  if (Math.abs(summary.balance) < 50) {
    return `${sentence} — tyle co trzeba, dzień w dzień.`;
  }

  const change = weeklyChange(summary.balance);
  const direction = summary.balance > 0 ? 'ponad budżet' : 'poniżej budżetu';
  const arrow = change > 0 ? 'w górę' : 'w dół';
  return `${sentence} — ${formatKcal(Math.abs(summary.balance))} dziennie ${direction}, czyli około ${formatNumber(Math.abs(change), 2)} kg tygodniowo ${arrow}.`;
}

/** „5 dni w budżecie, 2 ponad” — bez tego średnia ukrywa, że tydzień był skokowy. */
export function describeDays(summary: Summary): string | null {
  if (summary.overDays + summary.underDays === 0) return null;
  const parts: string[] = [];
  if (summary.underDays > 0) parts.push(`${summary.underDays} poniżej budżetu`);
  if (summary.overDays > 0) parts.push(`${summary.overDays} ponad`);
  return `${parts.join(', ')}.`;
}
