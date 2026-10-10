import { formatMl } from './format';

/**
 * Rozkład dnia i stan na teraz. To tutaj mieszka odpowiedź na pytanie „czy jestem w tyle”,
 * bez której przypomnienie co dwie godziny jest zwykłym budzikiem.
 */

/** Okno dnia, w którym pilnujemy picia. Poza nim nie przypominamy — w nocy się śpi. */
export type DayWindow = { from: string; to: string };

export const DEFAULT_WINDOW: DayWindow = { from: '08:00', to: '21:00' };
export const DEFAULT_EVERY_MINUTES = 90;

/** Porcje na przyciskach: szklanka, butelka, duża butelka. */
export const DEFAULT_PORTIONS_ML = [250, 500, 750];

/** „08:30” → 510 minut od północy; null dla czegokolwiek innego. */
export function parseTime(time: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 510 → „08:30”. */
export function formatTime(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const minutesOf = (at: Date): number => at.getHours() * 60 + at.getMinutes();

/**
 * Ile powinno być wypite o danej godzinie — liniowo przez okno dnia. Przed otwarciem okna nic,
 * po zamknięciu cały cel. Prosta kreska wystarcza: chodzi o rozłożenie picia na dzień, a nie
 * o model fizjologiczny.
 */
export function expectedAt(targetMl: number, window: DayWindow, at: Date): number {
  const from = parseTime(window.from);
  const to = parseTime(window.to);
  // Zepsute okno (albo takie, które się domyka) nie może kazać pić wszystkiego naraz.
  if (from === null || to === null || to <= from) return 0;

  const minutes = minutesOf(at);
  if (minutes <= from) return 0;
  if (minutes >= to) return targetMl;
  return Math.round((targetMl * (minutes - from)) / (to - from));
}

/** Ile brakuje do kreski na daną godzinę; zero, gdy jesteś na niej albo wyżej. */
export function behindAt(
  targetMl: number,
  consumedMl: number,
  window: DayWindow,
  at: Date,
): number {
  return Math.max(0, expectedAt(targetMl, window, at) - consumedMl);
}

/** Wypełnienie paska, przycięte do zakresu 0–1. */
export function dayRatio(consumedMl: number, targetMl: number): number {
  if (targetMl <= 0) return 0;
  return Math.min(1, Math.max(0, consumedMl / targetMl));
}

/** Zdanie pod paskiem: dowieziony cel, spokój albo zaległość. */
export function describeDay(
  consumedMl: number,
  targetMl: number,
  window: DayWindow,
  at: Date,
): string {
  if (consumedMl >= targetMl) return 'Cel dnia dowieziony.';
  const behind = behindAt(targetMl, consumedMl, window, at);
  const left = formatMl(targetMl - consumedMl);
  if (behind === 0) return `Jesteś na kresce — do celu ${left}.`;
  return `Zaległość ${formatMl(behind)} — do celu ${left}.`;
}

/** Treść przypomnienia. Mówi, ile brakuje teraz i ile zostało do końca dnia. */
export function describeReminder(missingMl: number, remainingMl: number): string {
  return `Brakuje ${formatMl(missingMl)} do kreski na teraz. Do celu dnia ${formatMl(remainingMl)}.`;
}
