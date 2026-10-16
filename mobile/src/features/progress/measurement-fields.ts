import { formatNumber } from '@/lib/number';

import type { MeasurementInput } from './repository';

/**
 * Pola pomiaru: te same w formularzu i w opisie wiersza historii.
 *
 * Dwie listy w dwóch plikach rozjechałyby się przy pierwszym dołożonym obwodzie — formularz
 * przyjmowałby wartość, której historia nie pokazuje.
 */
export const MEASUREMENT_FIELDS: {
  key: keyof MeasurementInput;
  label: string;
  suffix: string;
  decimal?: boolean;
}[] = [
  { key: 'weightKg', label: 'Waga', suffix: 'kg', decimal: true },
  { key: 'bodyFatPercent', label: 'Tł. tłuszczowa', suffix: '%', decimal: true },
  { key: 'chestCm', label: 'Klatka', suffix: 'cm', decimal: true },
  { key: 'waistCm', label: 'Talia', suffix: 'cm', decimal: true },
  { key: 'hipsCm', label: 'Biodra', suffix: 'cm', decimal: true },
  { key: 'armCm', label: 'Ramię', suffix: 'cm', decimal: true },
  { key: 'thighCm', label: 'Udo', suffix: 'cm', decimal: true },
];

/** Ciśnienie stoi osobno: to para liczb całkowitych w innej jednostce niż reszta pomiarów. */
export const PRESSURE_FIELDS: { key: 'systolic' | 'diastolic'; label: string }[] = [
  { key: 'systolic', label: 'Skurczowe' },
  { key: 'diastolic', label: 'Rozkurczowe' },
];

/** Jeden pomiar w jednej linii — tyle, ile zapisano, bez pustych miejsc po reszcie. */
export function describeMeasurement(measurement: Record<string, unknown>): string {
  const parts = MEASUREMENT_FIELDS.map((field) => {
    const value = measurement[field.key];
    return typeof value === 'number' ? `${field.label} ${formatNumber(value, 1)} ${field.suffix}` : null;
  });

  // Ciśnienie czyta się jako jedną wartość „120/80”, a nie jako dwie osobne liczby.
  const { systolic, diastolic } = measurement;
  if (typeof systolic === 'number' && typeof diastolic === 'number') {
    parts.push(`Ciśnienie ${systolic}/${diastolic}`);
  }

  return parts.filter(Boolean).join(' · ') || 'brak wartości';
}
