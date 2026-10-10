import { formatNumber } from '@/lib/number';

/** Spacja nierozdzielająca — jednostka nie ma prawa zostać sama na nowej linii. */
const NBSP = ' ';

/**
 * Mililitry na ekran. W bazie trzymamy wyłącznie ml — jedna jednostka, żadnych przeliczeń przy
 * zapisie — ale „2400 ml” nikt nie czyta jako celu dnia, więc od litra zmieniamy jednostkę.
 */
export function formatMl(milliliters: number): string {
  const ml = Math.round(milliliters);
  if (Math.abs(ml) < 1000) return `${formatNumber(ml)}${NBSP}ml`;
  // Bez zbędnego zera: 2 l, 2,4 l. Druga cyfra po przecinku nic tu nie wnosi.
  const litres = Math.round(ml / 100) / 10;
  return `${formatNumber(litres, Number.isInteger(litres) ? 0 : 1)}${NBSP}l`;
}

/** Godzina porcji w strefie telefonu: „14:05”. Oś czasu dnia nie potrzebuje daty. */
export function portionTime(iso: string): string {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}
