import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  type Permission,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';
import { toDateKey } from '@/lib/date';

import {
  caloriesInWindow,
  dayKeysBetween,
  latestOfDay,
  sleepMinutesForDay,
  summarizeHeartRate,
} from './mapping';
import { saveActivityMetrics, saveDailyHealth, sessionsSince } from './repository';

export const LAST_HEALTH_SYNC_KEY = 'health_last_sync';

/** Health Connect udostępnia bez dodatkowych uprawnień 30 dni wstecz. */
export const HISTORY_DAYS = 30;

/** Odczyt treningów nagranych poza aplikacją — potrzebny tylko ekranowi „Z zegarka”. */
export const EXERCISE_PERMISSION: Permission = { accessType: 'read', recordType: 'ExerciseSession' };

/** Dystans jest osobnym rodzajem danych: bez tej zgody biegi przychodzą bez kilometrów. */
export const DISTANCE_PERMISSION: Permission = { accessType: 'read', recordType: 'Distance' };

/** Komplet potrzebny ekranowi „Z zegarka”: sama aktywność i przebyty dystans. */
export const ACTIVITY_PERMISSIONS: Permission[] = [EXERCISE_PERMISSION, DISTANCE_PERMISSION];

export const HEALTH_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'BloodPressure' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  EXERCISE_PERMISSION,
  DISTANCE_PERMISSION,
];

export type HealthAvailability = 'AVAILABLE' | 'NEEDS_UPDATE' | 'UNAVAILABLE';

export async function getAvailability(): Promise<HealthAvailability> {
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'AVAILABLE';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'NEEDS_UPDATE';
    return 'UNAVAILABLE';
  } catch {
    return 'UNAVAILABLE';
  }
}

export const openSettings = () => openHealthConnectSettings();

async function ready(): Promise<boolean> {
  if ((await getAvailability()) !== 'AVAILABLE') return false;
  return initialize();
}

export async function grantedCount(): Promise<number> {
  if (!(await ready())) return 0;
  return (await getGrantedPermissions()).length;
}

/** Prosi o zgody i zwraca liczbę przyznanych. */
export async function requestHealthPermissions(): Promise<number> {
  if (!(await ready())) return 0;
  const granted = await requestPermission(HEALTH_PERMISSIONS);
  return granted.length;
}

export const lastSyncAt = (): string | null => getSetting(db, LAST_HEALTH_SYNC_KEY);

export type SyncResult = { sessions: number; days: number };

export class HealthUnavailableError extends Error {
  constructor(readonly availability: HealthAvailability) {
    super(
      availability === 'NEEDS_UPDATE'
        ? 'Health Connect wymaga aktualizacji.'
        : 'Health Connect nie jest dostępny na tym urządzeniu.',
    );
  }
}

export class HealthPermissionsError extends Error {
  constructor() {
    super('Brak zgody na odczyt danych zdrowotnych.');
  }
}

/**
 * Zgody w Health Connect nadaje się osobno dla każdego rodzaju danych. Odczyt ćwiczeń doszedł
 * później niż pozostałe, więc kto połączył aplikacje wcześniej, ma komplet zgód bez tej jednej.
 */
export class ExercisePermissionError extends Error {
  constructor() {
    super('Brak zgody na odczyt ćwiczeń.');
  }
}

/**
 * Prosi o zgody potrzebne liście „Z zegarka” i mówi, czy dostaliśmy tę na odczyt ćwiczeń.
 * O dystans pytamy przy okazji — jedno okno zamiast dwóch, a bez niego bieg nie ma kilometrów.
 */
export async function requestExercisePermission(): Promise<boolean> {
  if (!(await ready())) return false;
  const granted = await requestPermission(ACTIVITY_PERMISSIONS);
  return granted.some((permission) => permission.recordType === 'ExerciseSession');
}

/** Prosi o samą zgodę na dystans — gdy reszta już jest, a kilometrów brakuje. */
export async function requestDistancePermission(): Promise<boolean> {
  if (!(await ready())) return false;
  const granted = await requestPermission([DISTANCE_PERMISSION]);
  return granted.some((permission) => permission.recordType === 'Distance');
}

/**
 * Pobiera dane z Health Connect i zapisuje je lokalnie: metryki tętna i kalorii dopasowane
 * do okien treningów oraz dzienne podsumowania (tętno spoczynkowe, HRV, sen, ciśnienie).
 */
export async function syncHealth(now: Date = new Date()): Promise<SyncResult> {
  const availability = await getAvailability();
  if (availability !== 'AVAILABLE') throw new HealthUnavailableError(availability);
  if (!(await initialize())) throw new HealthUnavailableError('UNAVAILABLE');
  if ((await getGrantedPermissions()).length === 0) throw new HealthPermissionsError();

  const from = new Date(now.getTime() - HISTORY_DAYS * 24 * 3600 * 1000);
  const range = { operator: 'between', startTime: from.toISOString(), endTime: now.toISOString() } as const;

  const [heart, calories, resting, hrv, sleep, pressure] = await Promise.all([
    readRecords('HeartRate', { timeRangeFilter: range }),
    readRecords('ActiveCaloriesBurned', { timeRangeFilter: range }),
    readRecords('RestingHeartRate', { timeRangeFilter: range }),
    readRecords('HeartRateVariabilityRmssd', { timeRangeFilter: range }),
    readRecords('SleepSession', { timeRangeFilter: range }),
    readRecords('BloodPressure', { timeRangeFilter: range }),
  ]);

  const samples = heart.records.flatMap((record) => record.samples);
  // Źródło zapisu rozstrzyga, czy dwa bloki opisują to samo — bez niego kalorie z zegarka
  // i z telefonu dodawałyby się do siebie, tak jak wcześniej kilometry.
  const calorieBlocks = calories.records.map((record) => ({
    startTime: record.startTime,
    endTime: record.endTime,
    origin: record.metadata?.dataOrigin ?? '',
    kilocalories: record.energy.inKilocalories,
  }));

  let sessions = 0;
  for (const session of sessionsSince(db, from.toISOString())) {
    const summary = summarizeHeartRate(samples, session.startTime, session.endTime);
    const burned = caloriesInWindow(calorieBlocks, session.startTime, session.endTime);
    const saved = saveActivityMetrics(db, {
      sessionId: session.id,
      avgHeartRate: summary.avgHeartRate,
      maxHeartRate: summary.maxHeartRate,
      caloriesBurned: burned,
      rawGarminJson: null,
    });
    if (saved) sessions += 1;
  }

  let days = 0;
  for (const dayKey of dayKeysBetween(from, now)) {
    const restingOfDay = latestOfDay(resting.records, dayKey);
    const hrvOfDay = latestOfDay(hrv.records, dayKey);
    const pressureOfDay = latestOfDay(pressure.records, dayKey);
    const saved = saveDailyHealth(db, {
      summaryDate: dayKey,
      restingHeartRate: restingOfDay?.beatsPerMinute ?? null,
      hrvAvgMs: hrvOfDay ? Math.round(hrvOfDay.heartRateVariabilityMillis) : null,
      sleepDurationMinutes: sleepMinutesForDay(sleep.records, dayKey),
      bloodPressureSystolic: pressureOfDay
        ? Math.round(pressureOfDay.systolic.inMillimetersOfMercury)
        : null,
      bloodPressureDiastolic: pressureOfDay
        ? Math.round(pressureOfDay.diastolic.inMillimetersOfMercury)
        : null,
      activeCalories: dailyCalories(calorieBlocks, dayKey),
      rawGarminJson: null,
    });
    if (saved) days += 1;
  }

  setSetting(db, LAST_HEALTH_SYNC_KEY, now.toISOString());
  return { sessions, days };
}

function dailyCalories(
  blocks: { startTime: string; endTime: string; kilocalories: number }[],
  dayKey: string,
): number | null {
  const ofDay = blocks.filter((block) => toDateKey(new Date(block.startTime)) === dayKey);
  if (ofDay.length === 0) return null;
  return Math.round(ofDay.reduce((sum, block) => sum + block.kilocalories, 0));
}
