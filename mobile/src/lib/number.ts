// Polskie formaty liczb: spacja jako separator tysięcy, przecinek dziesiętny.

const NBSP = ' ';

/** 12345 → „12 345”; wartości ułamkowe zaokrąglane do `decimals`. */
export function formatNumber(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = value < 0 ? '−' : '';
  return `${sign}${grouped}${fraction ? `,${fraction}` : ''}`;
}

/** Ciężar bez zbędnych zer: 62,5 kg, 100 kg. */
export function formatKg(value: number): string {
  return `${formatNumber(value, Number.isInteger(value) ? 0 : 1)}${NBSP}kg`;
}

/**
 * Skrót dla osi i kafelków: 850 → „850 kg”, 12 400 → „12,4 t”. Jednostka jest zawsze, bo
 * te wartości stoją obok siebie na jednej liście — gołe „280” przy „1,6 t” czyta się jak tony.
 */
export function formatTonnage(value: number): string {
  if (value >= 1000) return `${formatNumber(value / 1000, 1)}${NBSP}t`;
  return `${formatNumber(value)}${NBSP}kg`;
}

/**
 * Polska odmiana rzeczownika po liczbie: 1 seria, 2 serie, 5 serii, 12 serii, 22 serie.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (abs === 1) return one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

/** Liczba razem z odmienionym rzeczownikiem, np. „5 serii”. */
export const pluralWith = (count: number, one: string, few: string, many: string): string =>
  `${formatNumber(count)} ${plural(count, one, few, many)}`;
