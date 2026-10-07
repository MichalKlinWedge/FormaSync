import { toDateKey } from '@/lib/date';

/**
 * Czyste przeliczenia odczytów z Health Connect. Trzymamy je osobno od wywołań natywnych,
 * żeby dało się je przetestować bez urządzenia.
 *
 * Źródłem danych jest Garmin Connect, który zapisuje je do Health Connect. Tą drogą nie
 * przychodzą metryki własne Garmina: Body Battery, poziom stresu ani gotowość treningowa.
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

/**
 * Kalorie z okresów nachodzących na okno sesji, liczone proporcjonalnie do części wspólnej —
 * Health Connect dzieli dobę na bloki, które rzadko pokrywają się z treningiem co do minuty.
 */
export function caloriesInWindow(
  records: (Interval & { kilocalories: number })[],
  startTime: string,
  endTime: string,
): number | null {
  const total = sumInWindow(records, (record) => record.kilocalories, startTime, endTime);
  return total === null ? null : Math.round(total);
}

/**
 * Dystans z okresów nachodzących na okno sesji. Garmin zapisuje go blokami, które nie muszą
 * pokrywać się z treningiem co do sekundy, więc część wspólną liczymy proporcjonalnie — tak samo
 * jak kalorie.
 */
export function metersInWindow(
  records: (Interval & { meters: number })[],
  startTime: string,
  endTime: string,
): number | null {
  const total = sumInWindow(records, (record) => record.meters, startTime, endTime);
  return total === null ? null : Math.round(total);
}

/** Suma wartości z bloków nachodzących na okno, ważona długością części wspólnej. */
function sumInWindow<T extends Interval>(
  records: T[],
  valueOf: (record: T) => number,
  startTime: string,
  endTime: string,
): number | null {
  const from = Date.parse(startTime);
  const to = Date.parse(endTime);
  let total = 0;
  let matched = false;
  for (const record of records) {
    const recordStart = Date.parse(record.startTime);
    const recordEnd = Date.parse(record.endTime);
    const overlap = Math.min(to, recordEnd) - Math.max(from, recordStart);
    if (overlap <= 0) continue;
    const span = recordEnd - recordStart;
    const value = valueOf(record);
    total += span > 0 ? (value * overlap) / span : value;
    matched = true;
  }
  return matched ? total : null;
}

/** Sumaryczny czas snu w minutach dla sesji kończących się danego dnia. */
export function sleepMinutesForDay(sessions: Interval[], dayKey: string): number | null {
  const matching = sessions.filter((session) => toDateKey(new Date(session.endTime)) === dayKey);
  if (matching.length === 0) return null;
  const total = matching.reduce(
    (sum, session) => sum + (Date.parse(session.endTime) - Date.parse(session.startTime)),
    0,
  );
  return Math.round(total / 60000);
}

/** Ostatni odczyt z danego dnia — np. tętno spoczynkowe albo ciśnienie. */
export function latestOfDay<T extends { time: string }>(records: T[], dayKey: string): T | null {
  const ofDay = records
    .filter((record) => toDateKey(new Date(record.time)) === dayKey)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return ofDay.at(-1) ?? null;
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

/**
 * Wartość z podsumowania Health Connect ma pierwszeństwo przed własnym sumowaniem zapisów.
 *
 * Health Connect wie, które zapisy pochodzą z różnych źródeł i opisują to samo — Garmin zapisuje
 * dystans treningu, a telefon równolegle liczy kroki. Zwykłe dodanie wszystkiego, co nachodzi na
 * okno treningu, podwaja wtedy kilometry: bieg na 10 km pokazywał się jako 17,65 km.
 *
 * Sumowanie zostaje jako zapasowa droga, gdy podsumowanie nie dojdzie albo wyjdzie puste —
 * lepszy dystans policzony z grubsza niż jego brak.
 */
export function preferAggregate(aggregate: number | null, summed: number | null): number | null {
  if (aggregate !== null && Number.isFinite(aggregate) && aggregate > 0) return Math.round(aggregate);
  return summed;
}
