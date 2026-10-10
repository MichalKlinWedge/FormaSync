import { toDateKey } from '@/lib/date';

/**
 * Czyste przeliczenia danych zdrowotnych — osobno od zapytań do Garmin Connect, żeby dało się
 * je przetestować bez sieci i bez urządzenia.
 *
 * Tą drogą nie przychodzą metryki własne Garmina: Body Battery, poziom stresu ani gotowość
 * treningowa.
 */

export type Sample = { time: string; beatsPerMinute: number };
export type Interval = { startTime: string; endTime: string };

const within = (iso: string, from: number, to: number) => {
  const at = Date.parse(iso);
  return at >= from && at <= to;
};

export type HeartRateSummary = { avgHeartRate: number | null; maxHeartRate: number | null };

/** Średnie i maksymalne tętno z próbek mieszczących się w oknie sesji. */
export function summarizeHeartRate(samples: Sample[], startTime: string, endTime: string): HeartRateSummary {
  const from = Date.parse(startTime);
  const to = Date.parse(endTime);
  const values = samples.filter((s) => within(s.time, from, to)).map((s) => s.beatsPerMinute);
  if (values.length === 0) return { avgHeartRate: null, maxHeartRate: null };
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    avgHeartRate: Math.round(sum / values.length),
    maxHeartRate: Math.max(...values),
  };
}

/** Dni (klucze YYYY-MM-DD) od `from` do `to` włącznie, w czasie lokalnym. */
export function dayKeysBetween(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= last) {
    days.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
