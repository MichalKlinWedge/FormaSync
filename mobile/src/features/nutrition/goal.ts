import { formatNumber } from '@/lib/number';

import { formatKcal } from './format';

/**
 * Cel diety. To on decyduje o wszystkim, co dalej: ta sama osoba o tej samej masie ciała ma inny
 * budżet na redukcji i inny na masie, więc licznik kalorii bez celu nie odpowiada na żadne pytanie.
 *
 * Cel podaje się tempem zmiany masy ciała, nie liczbą kalorii. Powód jest prosty: „pół kilograma
 * na tydzień” da się sprawdzić na wadze, a „minus 500 kcal” nie da się sprawdzić w ogóle.
 */

export const dietModes = ['REDUCTION', 'MAINTENANCE', 'MASS'] as const;
export type DietMode = (typeof dietModes)[number];

export const MODE_LABELS: Record<DietMode, string> = {
  REDUCTION: 'redukcja',
  MAINTENANCE: 'utrzymanie',
  MASS: 'masa',
};

/** Ten sam cel po przyimku „na”: na redukcję, na masę. Biernik, bo inaczej zdanie kuleje. */
export const MODE_FOR_LABELS: Record<DietMode, string> = {
  REDUCTION: 'redukcję',
  MAINTENANCE: 'utrzymanie',
  MASS: 'masę',
};

/**
 * Ile kalorii waży kilogram tkanki — przyjęte 7700 kcal. Liczba orientacyjna: w kilogramie
 * czystego tłuszczu jest jej więcej, a przy szybkich zmianach masy połowa to woda i glikogen.
 * Do przełożenia tempa na dzienny deficyt wystarcza.
 */
export const KCAL_PER_KG = 7700;

/** Domyślne tempo zmiany masy ciała w kilogramach na tydzień. */
export const DEFAULT_RATE: Record<DietMode, number> = {
  REDUCTION: 0.5,
  MAINTENANCE: 0,
  MASS: 0.25,
};

/**
 * Tempa do wyboru. Powyżej kilograma na tydzień redukcja przestaje być dietą, a powyżej pół
 * kilograma przyrost jest w większości tym, czego nikt nie chciał.
 */
export const RATE_OPTIONS: Record<DietMode, number[]> = {
  REDUCTION: [0.25, 0.5, 0.75, 1],
  MAINTENANCE: [0],
  MASS: [0.1, 0.25, 0.5],
};

/**
 * Białko w gramach na kilogram masy ciała. Na redukcji dajemy najwięcej — przy deficycie to ono
 * decyduje, czy schodzi tłuszcz czy mięśnie. Wartości z zaleceń dla osób trenujących siłowo.
 */
export const PROTEIN_PER_KG: Record<DietMode, number> = {
  REDUCTION: 2,
  MAINTENANCE: 1.6,
  MASS: 1.8,
};

export const RATE_MAX = 1;
export const PROTEIN_RANGE = { min: 0.8, max: 3 };

/** „0,5 kg/tydz.”, „0,25 kg/tydz.” — bez zbędnych zer na końcu. */
export function formatRate(ratePerWeek: number): string {
  const decimals = Number.isInteger(ratePerWeek) ? 0 : (ratePerWeek * 10) % 1 === 0 ? 1 : 2;
  return `${formatNumber(ratePerWeek, decimals)} kg/tydz.`;
}

/**
 * Dzienna poprawka kalorii wynikająca z celu: ujemna na redukcji, dodatnia na masie. Tempo jest
 * zawsze liczbą dodatnią — kierunek bierze się z trybu, nie ze znaku.
 */
export function dailyDelta(mode: DietMode, ratePerWeek: number): number {
  if (mode === 'MAINTENANCE') return 0;
  const rate = Math.min(Math.max(Math.abs(ratePerWeek), 0), RATE_MAX);
  const perDay = Math.round((rate * KCAL_PER_KG) / 7);
  return mode === 'REDUCTION' ? -perDay : perDay;
}

/** „redukcja, 0,5 kg/tydz. — 550 kcal mniej dziennie”. */
export function describeGoal(mode: DietMode, ratePerWeek: number): string {
  const delta = dailyDelta(mode, ratePerWeek);
  if (delta === 0) return `${MODE_LABELS[mode]} — budżet bez poprawki`;
  return `${MODE_LABELS[mode]}, ${formatRate(ratePerWeek)} — ${formatKcal(Math.abs(delta))} ${
    delta < 0 ? 'mniej' : 'więcej'
  } dziennie`;
}
