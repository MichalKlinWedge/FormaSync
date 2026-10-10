import { getGrantedPermissions, initialize, readRecords } from 'react-native-health-connect';

import { db } from '@/db/client';
import { attachSession, openTermsOn } from '@/features/calendar/repository';
import { toDateKey } from '@/lib/date';

import type { ImportCandidate, InventoryEntry, WatchActivity } from './activities-mapping';
import { inventory, selectImportable, toWatchActivity } from './activities-mapping';
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

export type { ActivityStatus, ImportCandidate, InventoryEntry, SessionWindow, WatchActivity } from './activities-mapping';

/** Lista aktywności razem z informacją, czy dystans w ogóle mógł dojść. */
export type WatchActivities = {
  activities: ImportCandidate[];
  /** false, gdy brakuje zgody na odczyt dystansu — wtedy biegi przychodzą bez kilometrów. */
  distanceAvailable: boolean;
  /** Wszystko, co Health Connect zwrócił w oknie odczytu — także to, co lista pomija. */
  inventory: InventoryEntry[];
};

/**
 * Treningi nagrane poza aplikacją — na zegarku albo w telefonie — których jeszcze nie ma
 * w historii. Czyta je z Health Connect razem z dystansem, tętnem i kaloriami z tego samego okna.
 */
export async function listWatchActivities(now: Date = new Date()): Promise<WatchActivities> {
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

  // Dystans to osobna zgoda, nadawana niezależnie od reszty. Bez niej odczyt rzuciłby wyjątkiem,
  // więc pomijamy go i mówimy o tym wprost, zamiast pokazywać bieg bez kilometrów bez wyjaśnienia.
  const distanceAvailable = granted.some((permission) => permission.recordType === 'Distance');

  const [exercise, heart, calories, distance] = await Promise.all([
    readRecords('ExerciseSession', { timeRangeFilter: range }),
    readRecords('HeartRate', { timeRangeFilter: range }),
    readRecords('ActiveCaloriesBurned', { timeRangeFilter: range }),
    distanceAvailable
      ? readRecords('Distance', { timeRangeFilter: range })
      : Promise.resolve({
          records: [] as {
            startTime: string;
            endTime: string;
            metadata?: { dataOrigin?: string };
            distance: { inMeters: number };
          }[],
        }),
  ]);

  const samples = heart.records.flatMap((record) => record.samples);
  // Program, który zapisał blok, jest tu nieodzowny: ten sam bieg trafia do Health Connect
  // z zegarka i z licznika kroków telefonu, a dodanie obu podwaja kilometry.
  const calorieBlocks = calories.records.map((record) => ({
    startTime: record.startTime,
    endTime: record.endTime,
    origin: record.metadata?.dataOrigin ?? '',
    kilocalories: record.energy.inKilocalories,
  }));
  const distanceBlocks = distance.records.map((record) => ({
    startTime: record.startTime,
    endTime: record.endTime,
    origin: record.metadata?.dataOrigin ?? '',
    meters: record.distance.inMeters,
  }));

  const activities = exercise.records
    .map((record) => toWatchActivity(record, samples, calorieBlocks, distanceBlocks))
    .filter((activity): activity is WatchActivity => activity !== null);

  const imported = importedActivityIds(db);
  const archived = archivedActivityIds(db);

  return {
    distanceAvailable,
    inventory: inventory(activities, imported, archived),
    activities: selectImportable(activities, imported, archived, sessionWindows(db, fromIso)),
  };
}

/** Dopisuje aktywność do historii i zwraca identyfikator utworzonej sesji. */
export const importWatchActivity = (activity: WatchActivity): number =>
  createSessionFromActivity(db, activity);

/** Dopina pomiary z zegarka do treningu już zapisanego w aplikacji. */
export const linkWatchActivity = (sessionId: number, activity: WatchActivity): void =>
  linkActivityToSession(db, sessionId, activity);

/**
 * Zaplanowane terminy tego samego dnia i tej samej dyscypliny, czekające na trening. Aktywność
 * z zegarka prawie zawsze jest właśnie tym zaplanowanym treningiem, więc nie każemy użytkownika
 * najpierw dopisywać jej do historii, a potem szukać terminu w kalendarzu.
 */
export const termsForActivity = (activity: WatchActivity) =>
  openTermsOn(db, toDateKey(new Date(activity.startTime)), activity.sport);

/**
 * Dopisuje aktywność do historii i od razu przypina ją do terminu. Dwa kroki w jednym, bo
 * osobno nie mają sensu: trening bez terminu zostawiłby go pustym, a termin bez treningu nie ma
 * czego pokazać.
 */
export function importWatchActivityToTerm(scheduledId: number, activity: WatchActivity): number {
  const sessionId = createSessionFromActivity(db, activity);
  attachSession(db, scheduledId, sessionId);
  return sessionId;
}

/** Treningi z okolic daty aktywności, z którymi można ją połączyć. */
export const sessionsToLink = (activity: WatchActivity) => linkCandidates(db, activity.startTime);

/** Odkłada aktywność, której nie chcemy w historii. */
export const archiveWatchActivity = (activity: WatchActivity): void => archiveActivity(db, activity);

export const listArchived = () => listArchivedActivities(db);

export const restoreWatchActivity = (recordId: string): void => restoreActivity(db, recordId);
