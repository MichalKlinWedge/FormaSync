import { db } from '@/db/client';
import { adoptTermPlan, attachSession, openTermsOn } from '@/features/calendar/repository';
import { fetchGarminActivities } from '@/features/garmin/connect/activities';
import { GarminNotConnectedError, isConnected } from '@/features/garmin/connect/client';
import { fetchGarminLaps, lapsMatchTotal, lapsPlausible } from '@/features/garmin/connect/laps';
import {
  archiveActivity,
  archivedActivityIds,
  createSessionFromActivity,
  garminLinkedSessions,
  importedActivityIds,
  linkActivityToSession,
  linkCandidates,
  listArchivedActivities,
  replaceSegmentsWithLaps,
  restoreActivity,
  sessionsMissingLaps,
  sessionWindows,
  setSessionSport,
} from '@/features/health/repository';
import { FASTEST_PLAUSIBLE_PACE } from '@/features/endurance/records';
import { toDateKey } from '@/lib/date';

import type { ImportCandidate, InventoryEntry, WatchActivity } from './mapping';
import {
  alreadySettled,
  findOverlappingSession,
  IMPORT_DAYS,
  inventory,
  sameMoment,
  selectImportable,
} from './mapping';

export type {
  ActivityStatus,
  ImportCandidate,
  InventoryEntry,
  SessionWindow,
  WatchActivity,
} from './mapping';

export { GarminNotConnectedError } from '@/features/garmin/connect/client';

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

/**
 * Okrążenia aktywności, o ile zgadzają się z jej podsumowaniem. Pobieramy je dopiero przy
 * wczytaniu, a nie przy budowaniu listy: osobne zapytanie na każdą z pięćdziesięciu aktywności
 * kazałoby czekać na ekran, którego większość pozycji nikt tego dnia nie tknie.
 */
async function lapsFor(activity: WatchActivity) {
  const laps = await fetchGarminLaps(activity.recordId);
  const fastest = FASTEST_PLAUSIBLE_PACE[activity.sport];
  return lapsMatchTotal(laps, activity.distanceMeters) && lapsPlausible(laps, fastest) ? laps : [];
}

/** Dopisuje aktywność do historii i zwraca identyfikator utworzonej sesji. */
export const importWatchActivity = async (activity: WatchActivity): Promise<number> =>
  createSessionFromActivity(db, activity, await lapsFor(activity));

/** Dopina pomiary z zegarka do treningu już zapisanego w aplikacji. */
export const linkWatchActivity = async (sessionId: number, activity: WatchActivity): Promise<void> =>
  linkActivityToSession(db, sessionId, activity, await lapsFor(activity));

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
export async function importWatchActivityToTerm(
  scheduledId: number,
  activity: WatchActivity,
): Promise<number> {
  const sessionId = createSessionFromActivity(db, activity, await lapsFor(activity));
  attachSession(db, scheduledId, sessionId);
  // Nazwa ma iść z planu, a nie z zegarka: w kalendarzu stał „Taniec”, Garmin zmierzył „Kardio”.
  adoptTermPlan(db, sessionId, scheduledId);
  return sessionId;
}

/** Okna historii do wyboru. Rok wstecz to u Garmina kilka stron listy, nie jedna. */
export const HISTORY_DAYS = [90, 180, 365];

export type HistoryImport = { seen: number; imported: number; skipped: number };

/**
 * Ściąga całą historię z wybranego okresu do historii aplikacji — jednym przebiegiem, bez
 * pytania o każdy trening osobno. Rok biegania to dwieście aktywności; przeklikanie ich po jednej
 * nie jest sposobem na zbudowanie punktu odniesienia dla planu.
 *
 * Pomijamy to, co już rozliczone: wczytane, odłożone i te, na które nachodzi trening prowadzony
 * w aplikacji. Okrążeń tą drogą nie pobieramy — to osobne zapytanie na każdą aktywność, więc przy
 * dwustu treningach czekałoby się minuty. Dociąga je przycisk okrążeń, już po wczytaniu.
 */
export async function importHistory(days: number, now: Date = new Date()): Promise<HistoryImport> {
  if (!(await isConnected())) throw new GarminNotConnectedError();

  const activities = await fetchGarminActivities(days, now);
  const fromIso = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
  const sessions = sessionWindows(db, fromIso);
  const imported = new Set([...importedActivityIds(db), ...alreadySettled(activities, sessions)]);
  const archived = new Set([
    ...archivedActivityIds(db),
    ...sameMoment(activities, listArchivedActivities(db)),
  ]);

  let added = 0;
  for (const activity of activities) {
    if (imported.has(activity.recordId) || archived.has(activity.recordId)) continue;
    // Trening prowadzony w aplikacji w tym samym czasie to ta sama jednostka zapisana dwukrotnie.
    // Przy ściąganiu hurtem nie ma komu podpowiedzieć połączenia, więc go po prostu nie dublujemy.
    if (findOverlappingSession(activity, sessions) !== null) continue;
    createSessionFromActivity(db, activity);
    added += 1;
  }

  return { seen: activities.length, imported: added, skipped: activities.length - added };
}

/** Ile treningów dostało okrążenia i ile okrążeń razem doszło. */
export type LapBackfill = { candidates: number; filled: number; laps: number };

/**
 * Dociąga okrążenia do treningów z zegarka, które mają w bazie tylko sumy. Wcześniejsze
 * wczytania zapisywały jeden odcinek, bo okrążeń wtedy nie pobieraliśmy — bez tego przebiegu
 * rekordy z całej dotychczasowej historii mogłyby wyjść wyłącznie ze średnich.
 *
 * Trening, dla którego Garmin nie ma okrążeń albo których suma nie zgadza się z dystansem,
 * zostaje jak był. Lepiej zostawić średnią niż podmienić historii dystans.
 */
export async function backfillLaps(): Promise<LapBackfill> {
  if (!(await isConnected())) throw new GarminNotConnectedError();

  const candidates = sessionsMissingLaps(db);
  let filled = 0;
  let laps = 0;

  for (const candidate of candidates) {
    const fetched = await fetchGarminLaps(candidate.recordId);
    if (!lapsMatchTotal(fetched, candidate.meters)) continue;
    // Jedno okrążenie z niemożliwym tempem psuje rekordy na zawsze, a suma dystansów takiego
    // zestawu bywa poprawna — więc sprawdzamy też same okrążenia, nie tylko ich sumę.
    if (!lapsPlausible(fetched, FASTEST_PLAUSIBLE_PACE[candidate.sport])) continue;
    replaceSegmentsWithLaps(db, candidate.sessionId, fetched, candidate.startTime);
    filled += 1;
    laps += fetched.length;
  }

  return { candidates: candidates.length, filled, laps };
}

export type SportRepair = { checked: number; fixed: number };

/**
 * Przypisuje wczytanym treningom dyscyplinę na nowo, według dzisiejszej reguły.
 *
 * Reguła bywa poprawiana — wędrówki i marsze szły kiedyś do biegania — a to, co już leży
 * w historii, zostaje z dawnym przypisaniem. Dopóki się go nie przeliczy, wędrówka po Tatrach
 * psuje rekordy biegowe i zawyża objętość, z której plan pod zawody liczy formę.
 *
 * Ruszamy wyłącznie treningi bez planu: te prowadzone w aplikacji mają dyscyplinę z planu.
 */
export async function repairSports(days: number, now: Date = new Date()): Promise<SportRepair> {
  if (!(await isConnected())) throw new GarminNotConnectedError();

  const activities = await fetchGarminActivities(days, now);
  const sportByRecord = new Map(activities.map((activity) => [activity.recordId, activity.sport]));

  const linked = garminLinkedSessions(db);
  let checked = 0;
  let fixed = 0;

  for (const session of linked) {
    const sport = sportByRecord.get(session.recordId);
    if (sport === undefined) continue;
    checked += 1;
    if (sport === session.sport) continue;
    setSessionSport(db, session.sessionId, sport);
    fixed += 1;
  }

  return { checked, fixed };
}

/** Treningi z okolic daty aktywności, z którymi można ją połączyć. */
export const sessionsToLink = (activity: WatchActivity) => linkCandidates(db, activity.startTime);

/** Odkłada aktywność, której nie chcemy w historii. */
export const archiveWatchActivity = (activity: WatchActivity): void => archiveActivity(db, activity);

export const listArchived = () => listArchivedActivities(db);

export const restoreWatchActivity = (recordId: string): void => restoreActivity(db, recordId);
