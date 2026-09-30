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

/** Skrót dla osi i kafelków: 850 → „850”, 12 400 → „12,4 t”. */
export function formatTonnage(value: number): string {
  if (value >= 1000) return `${formatNumber(value / 1000, 1)}${NBSP}t`;
  return formatNumber(value);
}
