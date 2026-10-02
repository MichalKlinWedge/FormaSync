import { getGrantedPermissions, initialize, readRecords } from 'react-native-health-connect';

import { db } from '@/db/client';

import type { WatchActivity } from './activities-mapping';
import { selectImportable, toWatchActivity } from './activities-mapping';
import { createSessionFromActivity, importedActivityIds, sessionWindows } from './repository';
import {
  getAvailability,
  HealthPermissionsError,
  HealthUnavailableError,
  HISTORY_DAYS,
} from './sync';

export type { WatchActivity } from './activities-mapping';

/**
 * Treningi nagrane poza aplikacją — na zegarku albo w telefonie — których jeszcze nie ma
 * w historii. Czyta je z Health Connect razem z tętnem i kaloriami z tego samego okna.
 */
export async function listWatchActivities(now: Date = new Date()): Promise<WatchActivity[]> {
  const availability = await getAvailability();
  if (availability !== 'AVAILABLE') throw new HealthUnavailableError(availability);
  if (!(await initialize())) throw new HealthUnavailableError('UNAVAILABLE');
  if ((await getGrantedPermissions()).length === 0) throw new HealthPermissionsError();

  const from = new Date(now.getTime() - HISTORY_DAYS * 24 * 3600 * 1000);
  const fromIso = from.toISOString();
  const range = { operator: 'between', startTime: fromIso, endTime: now.toISOString() } as const;

  const [exercise, heart, calories] = await Promise.all([
    readRecords('ExerciseSession', { timeRangeFilter: range }),
    readRecords('HeartRate', { timeRangeFilter: range }),
    readRecords('ActiveCaloriesBurned', { timeRangeFilter: range }),
  ]);

  const samples = heart.records.flatMap((record) => record.samples);
  const calorieBlocks = calories.records.map((record) => ({
    startTime: record.startTime,
    endTime: record.endTime,
    kilocalories: record.energy.inKilocalories,
  }));

  const activities = exercise.records
    .map((record) => toWatchActivity(record, samples, calorieBlocks))
    .filter((activity): activity is WatchActivity => activity !== null);

  return selectImportable(activities, importedActivityIds(db), sessionWindows(db, fromIso));
}

/** Dopisuje aktywność do historii i zwraca identyfikator utworzonej sesji. */
export const importWatchActivity = (activity: WatchActivity): number =>
  createSessionFromActivity(db, activity);
