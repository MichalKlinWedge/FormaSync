import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';
import { fetchGarminActivities } from '@/features/garmin/connect/activities';
import { GarminNotConnectedError, isConnected } from '@/features/garmin/connect/client';
import { fetchGarminRecords } from '@/features/garmin/connect/records';
import {
  accountName,
  fetchBloodPressure,
  fetchDailyHeartRate,
  fetchDailySummary,
  fetchHrv,
  fetchSleep,
  parseBloodPressure,
  parseHeartRateSamples,
  parseHrv,
  parseSleepMinutes,
  parseSummary,
} from '@/features/garmin/connect/wellness';
import { saveGarminRecords } from '@/features/garmin/records-store';
import { dayKeysBetween, summarizeHeartRate, type Sample } from '@/features/health/mapping';
import { saveDailyHealth, saveHeartRateMetrics, sessionsSince } from '@/features/health/repository';
import { toDateKey } from '@/lib/date';

import type { MetricName } from './report';

/**
 * Dane zdrowotne pobierane wprost z Garmin Connect: tętno spoczynkowe, sen, HRV, ciśnienie
 * i kalorie, a do tego tętno treningów prowadzonych w aplikacji.
 *
 * Wcześniej szły przez systemowy Health Connect, ale to Garmin Connect decydował, co do niego
 * zapisze, i potrafił pominąć dane bez śladu. Pytamy więc o nie bezpośrednio — tym samym
 * połączeniem, którym wysyłamy plany na zegarek.
 */

export const LAST_SYNC_KEY = 'health_last_sync';

/**
 * Ile dni odświeżamy przy jednym pobraniu. Każdy dzień to osobne zapytania, więc okno jest
 * krótkie: starsze dni są już zapisane, a zegarek i tak domyka dobę najpóźniej nad ranem.
 */
export const WELLNESS_DAYS = 7;

export const lastSyncAt = (): string | null => getSetting(db, LAST_SYNC_KEY);

export type SyncResult = {
  sessions: number;
  days: number;
  /** Ile rekordów życiowych przyszło z Garmina. Zero znaczy, że ich tam nie ma albo nie dał. */
  records: number;
  /** Ile dni przyniosło daną wartość. Zero przy wszystkich dniach znaczy, że tego Garmin nie dał. */
  counts: Record<MetricName, number>;
};



/** Pobiera dane zdrowotne i zapisuje je lokalnie. Zwraca, ile dni i treningów przyniosło wartości. */
export async function syncWellness(now: Date = new Date()): Promise<SyncResult> {
  if (!(await isConnected())) throw new GarminNotConnectedError();

  const from = new Date(now.getTime() - (WELLNESS_DAYS - 1) * 24 * 3600 * 1000);
  const dayKeys = dayKeysBetween(from, now);
  // Ciśnienie bierzemy jednym zapytaniem o cały zakres — pomiarów jest mało i rzadko kiedy
  // wypadają codziennie, więc pytanie o każdy dzień osobno byłoby samą stratą czasu.
  const pressure = parseBloodPressure(await fetchBloodPressure(dayKeys[0], dayKeys[dayKeys.length - 1]));

  const counts: Record<MetricName, number> = {
    restingHeartRate: 0,
    sleep: 0,
    hrv: 0,
    pressure: 0,
    calories: 0,
  };

  let days = 0;
  for (const dayKey of dayKeys) {
    const [summary, sleep, hrv] = await Promise.all([
      fetchDailySummary(dayKey),
      fetchSleep(dayKey),
      fetchHrv(dayKey),
    ]);
    const { restingHeartRate, activeCalories } = parseSummary(summary);
    const measured = pressure.get(dayKey) ?? null;
    const hrvAvgMs = parseHrv(hrv);
    const sleepDurationMinutes = parseSleepMinutes(sleep);

    if (restingHeartRate !== null) counts.restingHeartRate += 1;
    if (sleepDurationMinutes !== null) counts.sleep += 1;
    if (hrvAvgMs !== null) counts.hrv += 1;
    if (measured !== null) counts.pressure += 1;
    if (activeCalories !== null) counts.calories += 1;

    const saved = saveDailyHealth(db, {
      summaryDate: dayKey,
      restingHeartRate,
      hrvAvgMs,
      sleepDurationMinutes,
      bloodPressureSystolic: measured?.systolic ?? null,
      bloodPressureDiastolic: measured?.diastolic ?? null,
      activeCalories,
      rawGarminJson: null,
    });
    if (saved) days += 1;
  }

  const sessions = await measureSessions(from, now);
  // Rekordy życiowe idą tą samą drogą, bo to jedno zapytanie na całe pobranie, nie na każdy
  // dzień — a bez nich plan pod zawody nie ma od czego odmierzyć tempa docelowego.
  const records = await pullRecords();
  setSetting(db, LAST_SYNC_KEY, now.toISOString());
  return { sessions, days, counts, records };
}

/**
 * Rekordy życiowe z Garmina. Nieudana próba nie może przewrócić całego pobrania — reszta danych
 * jest ważniejsza, a o braku rekordów i tak mówi liczba w podsumowaniu.
 */
async function pullRecords(): Promise<number> {
  try {
    return saveGarminRecords(db, await fetchGarminRecords(await accountName()));
  } catch {
    return 0;
  }
}

/**
 * Dopisuje tętno treningom prowadzonym w aplikacji. Bierzemy je z całodobowego zapisu zegarka,
 * bo trening w aplikacji nie musi mieć osobnej aktywności na zegarku — a gdy ma, pomiary dojdą
 * dokładniejsze przy wczytaniu jej z listy „Z zegarka”.
 */
async function measureSessions(from: Date, now: Date): Promise<number> {
  const sessions = sessionsSince(db, from.toISOString());
  if (sessions.length === 0) return 0;

  // Aktywności z zegarka mają własne, policzone przez niego tętno treningu. Tam, gdzie pokrywają
  // się z sesją, są wiarygodniejsze niż próbki z całej doby.
  const activities = await fetchGarminActivities(WELLNESS_DAYS, now);
  const samplesByDay = new Map<string, Sample[]>();
  let measured = 0;

  for (const session of sessions) {
    const match = activities.find(
      (activity) =>
        Date.parse(activity.startTime) < Date.parse(session.endTime) &&
        Date.parse(activity.endTime) > Date.parse(session.startTime),
    );

    let heart = match
      ? { avgHeartRate: match.avgHeartRate, maxHeartRate: match.maxHeartRate }
      : null;

    if (heart === null || (heart.avgHeartRate === null && heart.maxHeartRate === null)) {
      const dayKey = toDateKey(new Date(session.startTime));
      if (!samplesByDay.has(dayKey)) {
        samplesByDay.set(dayKey, parseHeartRateSamples(await fetchDailyHeartRate(dayKey)));
      }
      const summary = summarizeHeartRate(samplesByDay.get(dayKey) ?? [], session.startTime, session.endTime);
      heart = { avgHeartRate: summary.avgHeartRate, maxHeartRate: summary.maxHeartRate };
    }

    if (saveHeartRateMetrics(db, { sessionId: session.id, ...heart })) measured += 1;
  }

  return measured;
}
