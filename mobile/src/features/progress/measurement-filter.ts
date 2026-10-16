/**
 * Zawężanie historii pomiarów.
 *
 * Pomiary zbierają się latami i lista rośnie w nieskończoność, a pytania do niej są zwykle dwa:
 * „co z ostatnich tygodni” i „kiedy mierzyłem ciśnienie”. Stąd dwa filtry zamiast jednego
 * wyszukiwania: okres i rodzaj wartości.
 *
 * Rodzaj sprawdzamy po tym, czy pomiar w ogóle ma taką wartość — wpis z samą wagą nie ma czego
 * powiedzieć o ciśnieniu i na liście ciśnień byłby pustym wierszem.
 */

export const measurementKinds = ['ALL', 'WEIGHT', 'PRESSURE', 'GIRTH'] as const;
export type MeasurementKind = (typeof measurementKinds)[number];

export const KIND_LABELS: Record<MeasurementKind, string> = {
  ALL: 'Wszystkie',
  WEIGHT: 'Waga',
  PRESSURE: 'Ciśnienie',
  GIRTH: 'Obwody',
};

/** Okna czasu do wyboru; null znaczy „od początku”. */
export const PERIODS: { label: string; days: number | null }[] = [
  { label: '30 dni', days: 30 },
  { label: '90 dni', days: 90 },
  { label: 'Rok', days: 365 },
  { label: 'Wszystko', days: null },
];

type Measurable = {
  measuredOn: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  systolic: number | null;
  diastolic: number | null;
};

/** Czy pomiar niesie wartość tego rodzaju. */
export function hasKind(measurement: Measurable, kind: MeasurementKind): boolean {
  switch (kind) {
    case 'ALL':
      return true;
    case 'WEIGHT':
      return measurement.weightKg !== null || measurement.bodyFatPercent !== null;
    case 'PRESSURE':
      return measurement.systolic !== null || measurement.diastolic !== null;
    case 'GIRTH':
      return [
        measurement.chestCm,
        measurement.waistCm,
        measurement.hipsCm,
        measurement.armCm,
        measurement.thighCm,
      ].some((value) => value !== null);
  }
}

export function filterMeasurements<T extends Measurable>(
  measurements: T[],
  options: { kind: MeasurementKind; from: string | null },
): T[] {
  return measurements.filter(
    (measurement) =>
      (options.from === null || measurement.measuredOn >= options.from)
      && hasKind(measurement, options.kind),
  );
}
