import { fromDateKey } from '@/lib/date';

import { formatKcal } from './format';
import { KCAL_PER_KG } from './goal';

/**
 * Własny wydatek, policzony z tego, co się zjadło i co zrobiła masa ciała.
 *
 * Wzór Mifflina jest średnią dla populacji — twoje ciało nie musi się w niej mieścić i zwykle się
 * nie mieści. Prawdę mówi dopiero rachunek z dwóch tygodni: jadłeś średnio tyle, masa poszła o tyle,
 * więc wydatek wynosi tyle. Nic tu nie jest mierzone tętnem ani krokami — to czysta arytmetyka
 * zachowania energii, i dlatego nie zmienia się po żadnej synchronizacji.
 *
 * Dwa tygodnie, bo krócej nie da się odróżnić zmiany tkanki od wody: jeden słony obiad przestawia
 * wagę o pół kilograma, a to przy krótkim oknie wyszłoby jako tysiąc kalorii różnicy.
 */

/** Okno, z którego liczymy — dni wstecz od dzisiaj. */
export const WINDOW_DAYS = 14;

/** Ile dni w oknie musi mieć zapisane jedzenie. Dziury zaniżają średnią i psują cały rachunek. */
export const MIN_LOGGED_DAYS = 10;

/** Ile dni muszą dzielić pierwszy i ostatni pomiar masy, żeby kierunek zmiany coś znaczył. */
export const MIN_WEIGHT_SPAN_DAYS = 10;

export type WeightPoint = { dayKey: string; weightKg: number };

const dayNumber = (key: string): number => Math.round(fromDateKey(key).getTime() / 86_400_000);

/**
 * Tempo zmiany masy w kg na tydzień, metodą najmniejszych kwadratów.
 *
 * Prosta przez wszystkie pomiary, a nie różnica pierwszego z ostatnim: masa ciała skacze o pół
 * kilograma z dnia na dzień i akurat te dwa pomiary mogłyby wypaść na przeciwnych końcach wahnięcia.
 */
export function weightSlope(points: WeightPoint[]): number | null {
  if (points.length < 2) return null;

  const xs = points.map((point) => dayNumber(point.dayKey));
  const ys = points.map((point) => point.weightKg);
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;

  const variance = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  // Wszystkie pomiary z jednego dnia: nachylenia nie ma, a dzielenie przez zero dałoby nieskończoność.
  if (variance === 0) return null;

  const covariance = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0);
  return (covariance / variance) * 7;
}

/** Ile dni dzieli skrajne pomiary. */
export function weightSpan(points: WeightPoint[]): number {
  if (points.length < 2) return 0;
  const days = points.map((point) => dayNumber(point.dayKey));
  return Math.max(...days) - Math.min(...days);
}

/** Czego brakuje, żeby policzyć własny wydatek. */
export type TdeeGap = 'DAYS' | 'WEIGHTS' | 'SPAN';

export type Tdee = {
  /** Wydatek dnia wyliczony z danych. */
  kcal: number;
  /** Średnie spożycie z dni, które mają zapisane jedzenie. */
  avgIntake: number;
  /** Tempo zmiany masy ciała w kg na tydzień; ujemne, gdy masa spada. */
  kgPerWeek: number;
  loggedDays: number;
  spanDays: number;
};

export type TdeeResult = { tdee: Tdee | null; missing: TdeeGap[] };

/**
 * Wydatek = średnie spożycie minus to, co odłożyło się w ciele.
 *
 * Kilogram tkanki to około 7700 kcal (stała z `goal.ts`, ta sama, na której stoi cel diety), więc
 * pół kilograma na tydzień to 550 kcal dziennie. Rosnąca masa znaczy, że jadłeś ponad wydatek —
 * i o tyle wydatek jest niższy od spożycia.
 */
export function adaptiveTdee(intakes: number[], points: WeightPoint[]): TdeeResult {
  const missing: TdeeGap[] = [];
  if (intakes.length < MIN_LOGGED_DAYS) missing.push('DAYS');

  const slope = weightSlope(points);
  const span = weightSpan(points);
  if (slope === null) missing.push('WEIGHTS');
  else if (span < MIN_WEIGHT_SPAN_DAYS) missing.push('SPAN');

  if (missing.length > 0 || slope === null) return { tdee: null, missing };

  const avgIntake = Math.round(intakes.reduce((sum, kcal) => sum + kcal, 0) / intakes.length);
  const dailySurplus = (slope * KCAL_PER_KG) / 7;

  return {
    tdee: {
      kcal: Math.round(avgIntake - dailySurplus),
      avgIntake,
      kgPerWeek: Math.round(slope * 100) / 100,
      loggedDays: intakes.length,
      spanDays: span,
    },
    missing,
  };
}

/** „Jeszcze 4 dni jedzenia i 2 pomiary masy” — czego dokładnie brakuje. */
export function describeGaps(missing: TdeeGap[], loggedDays: number): string {
  const parts = missing.map((gap) => {
    switch (gap) {
      case 'DAYS':
        return `${MIN_LOGGED_DAYS - loggedDays} dni z zapisanym jedzeniem`;
      case 'WEIGHTS':
        return 'dwa pomiary masy ciała';
      case 'SPAN':
        return `pomiar masy sprzed co najmniej ${MIN_WEIGHT_SPAN_DAYS} dni`;
    }
  });
  return `Do policzenia własnego wydatku brakuje: ${parts.join(' i ')}.`;
}

/**
 * Własny wydatek obok tego ze wzoru. Różnica jest tu najważniejsza: to ona mówi, czy wzór
 * zgaduje dobrze, czy od miesiąca liczy komuś innemu.
 */
export function describeTdee(tdee: Tdee, formulaKcal: number | null): string {
  const change =
    Math.abs(tdee.kgPerWeek) < 0.05
      ? 'masa stoi w miejscu'
      : `masa ${tdee.kgPerWeek > 0 ? 'rośnie' : 'spada'} o ${Math.abs(tdee.kgPerWeek)
          .toFixed(2)
          .replace('.', ',')} kg na tydzień`;
  const base = `Jadłeś średnio ${formatKcal(tdee.avgIntake)} przez ${tdee.loggedDays} dni i ${change}.`;

  if (formulaKcal === null) return base;
  const diff = tdee.kcal - formulaKcal;
  if (Math.abs(diff) < 100) {
    return `${base} Wzór trafia — różnica mieści się w błędzie liczenia.`;
  }
  return `${base} To ${formatKcal(Math.abs(diff))} ${diff > 0 ? 'więcej' : 'mniej'} niż ze wzoru.`;
}
