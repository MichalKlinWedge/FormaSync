import { getGrantedPermissions, initialize, readRecords } from 'react-native-health-connect';

import { db } from '@/db/client';

import type { ImportCandidate, WatchActivity } from './activities-mapping';
import { selectImportable, toWatchActivity } from './activities-mapping';
import {
  archiveActivity,
  archivedActivityIds,
  createSessionFromActivity,
  importedActivityIds,
  linkActivityToSession,
  linkCandidates,
  listArchivedActivities,
  restoreActivity,
  sessionWindows,
} from './repository';
import {
  ExercisePermissionError,
  getAvailability,
  HealthPermissionsError,
  HealthUnavailableError,
  HISTORY_DAYS,
} from './sync';

export type { ImportCandidate, SessionWindow, WatchActivity } from './activities-mapping';

/**
 * Treningi nagrane poza aplikacją — na zegarku albo w telefonie — których jeszcze nie ma
 * w historii. Czyta je z Health Connect razem z tętnem i kaloriami z tego samego okna.
 */
export async function listWatchActivities(now: Date = new Date()): Promise<ImportCandidate[]> {
  const availability = await getAvailability();
  if (availability !== 'AVAILABLE') throw new HealthUnavailableError(availability);
  if (!(await initialize())) throw new HealthUnavailableError('UNAVAILABLE');
  const granted = await getGrantedPermissions();
  if (granted.length === 0) throw new HealthPermissionsError();
  // Bez tej jednej zgody Health Connect rzuca wyjątkiem Javy — pytamy wcześniej, żeby
  // zamiast niego pokazać powód i przycisk nadania zgody.
  if (!granted.some((permission) => permission.recordType === 'ExerciseSession')) {
    throw new ExercisePermissionError();
  }

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

  return selectImportable(
    activities,
    importedActivityIds(db),
    archivedActivityIds(db),
    sessionWindows(db, fromIso),
  );
}

/** Dopisuje aktywność do historii i zwraca identyfikator utworzonej sesji. */
export const importWatchActivity = (activity: WatchActivity): number =>
  createSessionFromActivity(db, activity);

/** Dopina pomiary z zegarka do treningu już zapisanego w aplikacji. */
export const linkWatchActivity = (sessionId: number, activity: WatchActivity): void =>
  linkActivityToSession(db, sessionId, activity);

/** Treningi z okolic daty aktywności, z którymi można ją połączyć. */
export const sessionsToLink = (activity: WatchActivity) => linkCandidates(db, activity.startTime);

/** Odkłada aktywność, której nie chcemy w historii. */
export const archiveWatchActivity = (activity: WatchActivity): void => archiveActivity(db, activity);

export const listArchived = () => listArchivedActivities(db);

export const restoreWatchActivity = (recordId: string): void => restoreActivity(db, recordId);
