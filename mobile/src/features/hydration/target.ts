import { formatMl } from './format';

/**
 * Cel dnia: ile dziś wypić. Składamy go z masy ciała, dzisiejszego treningu i ręcznej korekty,
 * bo tylko wtedy rośnie w dniu, w którym naprawdę powinien — po dwunastu kilometrach w biegu
 * potrzeba więcej niż przy biurku, a aplikacja ten bieg już ma w historii.
 *
 * Liczby poniżej to reguły orientacyjne, nie zalecenie lekarskie. Każdą da się nadpisać stałym
 * celem wpisanym ręcznie.
 */

/** Podstawa: 30 ml na kilogram masy ciała. */
export const ML_PER_KG = 30;

/** Za godzinę wysiłku dokładamy pół litra — tyle schodzi z potem w umiarkowanym tempie. */
export const ML_PER_TRAINING_HOUR = 500;

/** Gdy nie znamy masy ciała. Dwa litry to wartość, od której zaczyna każdy poradnik. */
export const DEFAULT_TARGET_ML = 2000;

/** Zaokrąglamy do pięćdziesiątek: „2400 ml” czyta się jak cel, „2437 ml” jak wynik pomiaru. */
const STEP = 50;

const toStep = (milliliters: number): number => Math.round(milliliters / STEP) * STEP;

/** Skąd wzięła się podstawa celu. */
export type TargetBasis = 'MANUAL' | 'WEIGHT' | 'DEFAULT';

export type TargetInput = {
  weightKg: number | null;
  /** Czas dzisiejszych zakończonych treningów. */
  trainingSeconds: number;
  /** Stały cel wpisany ręcznie; gdy jest, masa ciała nie ma już nic do powiedzenia. */
  manualMl: number | null;
  /** Korekta na dziś: upał, sauna. Tylko w górę — nikt nie potrzebuje pić mniej. */
  extraMl: number;
};

export type DailyTarget = {
  total: number;
  base: number;
  training: number;
  extra: number;
  basis: TargetBasis;
};

export function dailyTarget(input: TargetInput): DailyTarget {
  const manual = input.manualMl !== null && input.manualMl > 0;
  const weighed = input.weightKg !== null && input.weightKg > 0;
  const basis: TargetBasis = manual ? 'MANUAL' : weighed ? 'WEIGHT' : 'DEFAULT';

  const base =
    basis === 'MANUAL'
      ? toStep(input.manualMl as number)
      : basis === 'WEIGHT'
        ? toStep((input.weightKg as number) * ML_PER_KG)
        : DEFAULT_TARGET_ML;
  const training = toStep((Math.max(input.trainingSeconds, 0) / 3600) * ML_PER_TRAINING_HOUR);
  const extra = Math.max(Math.round(input.extraMl), 0);

  return { total: base + training + extra, base, training, extra, basis };
}

const BASIS_LABELS: Record<TargetBasis, string> = {
  MANUAL: 'cel wpisany ręcznie',
  WEIGHT: 'z masy ciała',
  DEFAULT: 'domyślnie, bo nie znamy masy ciała',
};

/** Z czego wyszedł cel — żeby liczba na kafelku nie brała się z powietrza. */
export function describeTarget(target: DailyTarget): string {
  const parts = [`${formatMl(target.base)} ${BASIS_LABELS[target.basis]}`];
  if (target.training > 0) parts.push(`${formatMl(target.training)} za dzisiejszy trening`);
  if (target.extra > 0) parts.push(`${formatMl(target.extra)} korekty`);
  return parts.join(' + ');
}
