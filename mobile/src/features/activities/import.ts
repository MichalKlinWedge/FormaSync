import { db } from '@/db/client';
import { attachSession, openTermsOn } from '@/features/calendar/repository';
import { fetchGarminActivities } from '@/features/garmin/connect/activities';
import { isConnected } from '@/features/garmin/connect/client';
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
} from '@/features/health/repository';
import { toDateKey } from '@/lib/date';

import type { ImportCandidate, InventoryEntry, WatchActivity } from './mapping';
import { alreadySettled, IMPORT_DAYS, inventory, sameMoment, selectImportable } from './mapping';

export type {
  ActivityStatus,
  ImportCandidate,
  InventoryEntry,
  SessionWindow,
  WatchActivity,
} from './mapping';

/** Bez połączenia z Garmin Connect nie ma skąd czytać — i nie ma czego naprawiać na liście. */
export class GarminNotConnectedError extends Error {
  constructor() {
    super('Brak połączenia z Garmin Connect.');
  }
}

/** Lista do wczytania razem ze spisem wszystkiego, co Garmin zwrócił. */
export type WatchActivities = {
  activities: ImportCandidate[];
  inventory: InventoryEntry[];
};

/**
 * Treningi nagrane poza aplikacją, których jeszcze nie ma w historii. Czyta je wprost z Garmin
 * Connect — tym samym połączeniem, którym wysyłamy tam plany.
 */
export async function listWatchActivities(now: Date = new Date()): Promise<WatchActivities> {
  if (!(await isConnected())) throw new GarminNotConnectedError();

  const activities = await fetchGarminActivities(IMPORT_DAYS, now);
  const fromIso = new Date(now.getTime() - IMPORT_DAYS * 24 * 3600 * 1000).toISOString();
  const sessions = sessionWindows(db, fromIso);
  // Jeden zbiór „już rozliczonych” dla listy i dla spisu — inaczej spis mówiłby „do wczytania”
  // o treningu, którego lista słusznie nie pokazuje.
  const imported = new Set([
    ...importedActivityIds(db),
    ...alreadySettled(activities, sessions),
  ]);
  // Odłożone też mają stare identyfikatory — inaczej wróciłyby z Garmina jako nowe, mimo że
  // leżą niżej na tym samym ekranie, w sekcji odłożonych.
  const archived = new Set([
    ...archivedActivityIds(db),
    ...sameMoment(activities, listArchivedActivities(db)),
  ]);

  return {
    inventory: inventory(activities, imported, archived),
    activities: selectImportable(activities, imported, archived, sessions),
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
