import { formatNumber } from '@/lib/number';

/** Spacja nierozdzielająca — jednostka nie ma prawa zostać sama na nowej linii. */
const NBSP = ' ';

/** „2 310 kcal”. Kalorii nie ułamkujemy: dokładność wpisu i tak jest rzędu dziesiątek. */
export const formatKcal = (kcal: number): string => `${formatNumber(Math.round(kcal))}${NBSP}kcal`;

/** Gramy makroskładnika: „154 g”. */
export const formatGrams = (grams: number): string => `${formatNumber(Math.round(grams))}${NBSP}g`;

/** Godzina posiłku w strefie telefonu: „14:05”. Oś dnia nie potrzebuje daty. */
export function mealTime(iso: string): string {
  const at = new Date(iso);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/**
 * Nagłówek kalorii dnia: zjedzone, budżet na teraz i — gdy w planie został trening — cel całego
 * dnia. Trzecia liczba jest po to, żeby przed kolacją nie trzeba było liczyć w głowie, ile dołoży
 * wieczorne wyjście; bez zaplanowanego treningu byłaby powtórzeniem drugiej, więc jej nie ma.
 */
export function kcalHeadline(
  eaten: number,
  target: number | null,
  dayTarget: number | null,
): string {
  if (target === null) return formatKcal(eaten);
  const parts = [formatNumber(Math.round(eaten)), formatNumber(Math.round(target))];
  if (dayTarget !== null && dayTarget > target) parts.push(formatNumber(Math.round(dayTarget)));
  return `${parts.join(' / ')}${NBSP}kcal`;
}
