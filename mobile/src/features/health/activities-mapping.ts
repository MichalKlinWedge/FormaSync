import type { HeartRateSummary, Interval, Sample } from './mapping';
import { caloriesInWindow, summarizeHeartRate } from './mapping';

/**
 * Przeliczenia aktywności nagranych poza aplikacją — na zegarku albo w telefonie.
 * Garmin Connect zapisuje je do Health Connect jako `ExerciseSession`; tą drogą przychodzi
 * czas trwania i dyscyplina, ale nie serie ani powtórzenia. Te zegarek liczy wyłącznie
 * w aktywności siłowej prowadzonej po krokach wczytanego treningu i nie udostępnia ich
 * przez Health Connect, więc zaimportowany trening trafia do historii bez serii.
 */

/** Aktywność gotowa do pokazania na liście i zapisania jako sesja. */
export type WatchActivity = {
  /** Identyfikator rekordu w Health Connect — po nim poznajemy, że już go wczytaliśmy. */
  recordId: string;
  title: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesBurned: number | null;
};

export type ExerciseSession = Interval & {
  metadata?: { id?: string };
  exerciseType: number;
  title?: string;
};

/**
 * Nazwy dyscyplin, które realnie trafiają z zegarka Garmin. Pozostałe mają ogólną nazwę —
 * pełny słownik Health Connect to ponad osiemdziesiąt pozycji, z których większość nigdy
 * tu nie dotrze, a nietrafiona nazwa myli bardziej niż „Trening”.
 */
const EXERCISE_TYPE_NAMES: Record<number, string> = {
  0: 'Trening',
  8: 'Jazda na rowerze',
  9: 'Rower stacjonarny',
  10: 'Trening obwodowy',
  13: 'Kalistenika',
  25: 'Orbitrek',
  26: 'Zajęcia grupowe',
  36: 'Trening interwałowy',
  37: 'Wędrówka',
  48: 'Pilates',
  53: 'Wioślarstwo',
  54: 'Ergometr wioślarski',
  56: 'Bieganie',
  57: 'Bieżnia',
  61: 'Narciarstwo',
  62: 'Snowboard',
  68: 'Schody',
  69: 'Stepper',
  70: 'Trening siłowy',
  71: 'Rozciąganie',
  73: 'Pływanie na otwartej wodzie',
  74: 'Pływanie na basenie',
  79: 'Marsz',
  81: 'Podnoszenie ciężarów',
  83: 'Joga',
};

export const exerciseTypeName = (type: number): string => EXERCISE_TYPE_NAMES[type] ?? 'Trening';

/** Trening z aplikacji, na który nachodzi aktywność — kandydat do połączenia. */
export type SessionWindow = Interval & { id: number; title: string };

/**
 * Trening z aplikacji prowadzony w tym samym czasie co aktywność. Taka para to prawie zawsze
 * ten sam trening zapisany dwukrotnie: raz przez aplikację, raz przez zegarek. Nie ukrywamy go,
 * tylko podpowiadamy połączenie, żeby pomiary z czujników trafiły do istniejącego treningu.
 */
export function findOverlappingSession(
  activity: Interval,
  sessions: SessionWindow[],
): SessionWindow | null {
  const from = Date.parse(activity.startTime);
  const to = Date.parse(activity.endTime);
  return (
    sessions.find(
      (session) => Date.parse(session.startTime) < to && Date.parse(session.endTime) > from,
    ) ?? null
  );
}

/**
 * Składa aktywność z rekordu Health Connect i pomiarów z tego samego okna czasowego.
 * Zwraca null dla rekordów bez identyfikatora — bez niego nie odróżnilibyśmy ponownego
 * wczytania tej samej aktywności od nowej.
 */
export function toWatchActivity(
  record: ExerciseSession,
  samples: Sample[],
  calorieBlocks: (Interval & { kilocalories: number })[],
): WatchActivity | null {
  const recordId = record.metadata?.id;
  if (!recordId) return null;

  const heart: HeartRateSummary = summarizeHeartRate(samples, record.startTime, record.endTime);
  const seconds = Math.round((Date.parse(record.endTime) - Date.parse(record.startTime)) / 1000);

  return {
    recordId,
    title: record.title?.trim() || exerciseTypeName(record.exerciseType),
    startTime: record.startTime,
    endTime: record.endTime,
    durationSeconds: Math.max(seconds, 0),
    avgHeartRate: heart.avgHeartRate,
    maxHeartRate: heart.maxHeartRate,
    caloriesBurned: caloriesInWindow(calorieBlocks, record.startTime, record.endTime),
  };
}

/** Aktywność gotowa do pokazania razem z podpowiedzią treningu do połączenia. */
export type ImportCandidate = WatchActivity & { matchingSession: SessionWindow | null };

/** Aktywności jeszcze nieprzypisane i nieodłożone, od najnowszej. */
export function selectImportable(
  activities: WatchActivity[],
  imported: Set<string>,
  archived: Set<string>,
  sessions: SessionWindow[],
): ImportCandidate[] {
  return activities
    .filter((activity) => !imported.has(activity.recordId) && !archived.has(activity.recordId))
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
    .map((activity) => ({ ...activity, matchingSession: findOverlappingSession(activity, sessions) }));
}
