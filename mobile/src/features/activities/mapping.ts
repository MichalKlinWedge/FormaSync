import type { Sport } from '@/db/schema';

import { pluralWith } from '@/lib/number';

import type { Interval } from '@/features/health/mapping';

/**
 * Przeliczenia treningów nagranych poza aplikacją — na zegarku albo w telefonie Garmina.
 * Czyta je ekran „Z zegarka”, a dostarcza Garmin Connect: czas trwania, dyscyplina, dystans
 * i pomiary czujników. Serii ani powtórzeń ta droga nie zawiera — zegarek liczy je wyłącznie
 * w aktywności siłowej prowadzonej po krokach wczytanego treningu i nie udostępnia ich dalej,
 * więc zaimportowany trening trafia do historii bez serii.
 */

/** Jak daleko wstecz pytamy o aktywności. Dalej historia i tak jest już poukładana. */
export const IMPORT_DAYS = 30;

/** Aktywność gotowa do pokazania na liście i zapisania jako sesja. */
export type WatchActivity = {
  /** Identyfikator aktywności w Garmin Connect — po nim poznajemy, że już ją wczytaliśmy. */
  recordId: string;
  title: string;
  sport: Sport;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  /** Przebyty dystans w metrach; null dla treningów, które go nie mierzą. */
  distanceMeters: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesBurned: number | null;
};

/**
 * Wynik ręcznego pobrania: ile aktywności dopiero co doszło i ile w sumie czeka.
 * Przy zerze mówimy, gdzie szukać przyczyny — aplikacja czyta Garmin Connect, nie zegarek,
 * więc dopóki zegarek nie zsynchronizuje treningu, nie ma go skąd wziąć.
 */
export function describeRefresh(fresh: number, waiting: number): string {
  if (fresh > 0) return `Nowe treningi: ${fresh}.`;
  if (waiting > 0) return `Nic nowego nie doszło. Na liście czeka ${waiting}.`;
  return 'Nic nowego. Jeśli trening jest na zegarku, ale nie ma go w Garmin Connect, zsynchronizuj zegarek z telefonem.';
}

/**
 * Wynik dociągania okrążeń. Mówimy wprost, ilu treningów Garmin nie podzielił, bo to jedyny
 * sygnał, że rekordy wciąż wychodzą ze średnich — a tego z samego ekranu statystyk nie widać.
 */
export function describeLapBackfill(result: {
  candidates: number;
  filled: number;
  laps: number;
}): string {
  if (result.candidates === 0) return 'Wszystkie treningi z zegarka mają już okrążenia.';
  if (result.filled === 0) {
    return `Garmin nie podał okrążeń dla żadnego z ${pluralWith(result.candidates, 'treningu', 'treningów', 'treningów')}. Rekordy zostają liczone ze średnich.`;
  }
  const rest = result.candidates - result.filled;
  const done = `Okrążenia doszły do ${result.filled} z ${result.candidates}: razem ${pluralWith(result.laps, 'okrążenie', 'okrążenia', 'okrążeń')}.`;
  return rest === 0
    ? done
    : `${done} Dla pozostałych ${pluralWith(rest, 'treningu', 'treningów', 'treningów')} Garmin okrążeń nie ma.`;
}

/**
 * Wynik ściągania historii. Mówimy wprost, ile pominięto, bo przy hurtowym wczytaniu to jedyny
 * sygnał, że część treningów już w aplikacji była — a nie że Garmin ich nie dał.
 */
export function describeHistoryImport(result: {
  seen: number;
  imported: number;
  skipped: number;
}): string {
  if (result.seen === 0) {
    return 'Garmin nie zwrócił z tego okresu żadnej aktywności.';
  }
  if (result.imported === 0) {
    return `Wszystkie ${pluralWith(result.seen, 'aktywność', 'aktywności', 'aktywności')} z tego okresu są już w historii.`;
  }
  const added = `Dopisane do historii: ${pluralWith(result.imported, 'trening', 'treningi', 'treningów')}.`;
  return result.skipped === 0
    ? added
    : `${added} Pominięte jako już rozliczone: ${result.skipped}.`;
}

/** Trening z aplikacji, na który nachodzi aktywność — kandydat do połączenia. */
export type SessionWindow = Interval & { id: number; title: string; linked: boolean };

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

/**
 * Dlaczego aktywności nie ma na liście do wczytania: jest nowa, już trafiła do historii
 * albo została odłożona.
 */
export type ActivityStatus = 'NEW' | 'IMPORTED' | 'ARCHIVED';

/** Jedna pozycja spisu tego, co Garmin Connect naprawdę zwrócił. */
export type InventoryEntry = {
  recordId: string;
  title: string;
  startTime: string;
  status: ActivityStatus;
};

/**
 * Spis wszystkiego, co przyszło z Garmin Connect w oknie odczytu — razem z tym, co lista
 * do wczytania pomija. Bez niego brak treningu znaczy jednocześnie dwie różne rzeczy:
 * że Garmin go nie ma albo że ma, ale aplikacja go ukrywa. Pierwszego nie naprawi nic po
 * naszej stronie, drugie naprawia jedno dotknięcie, więc trzeba je dać rozróżnić.
 */
export function inventory(
  activities: WatchActivity[],
  imported: Set<string>,
  archived: Set<string>,
): InventoryEntry[] {
  return activities
    .map(({ recordId, title, startTime }) => ({
      recordId,
      title,
      startTime,
      status: statusOf(recordId, imported, archived),
    }))
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
}

/**
 * Ten sam trening ma w Garmin Connect inny numer niż miał w Health Connect, a wcześniejsze
 * wczytania i odłożenia zapisały się z tym starym. Bez rozpoznania po czasie cały załatwiony
 * miesiąc wróciłby na listę jako nowy.
 */

/** Ile czasu startu może się różnić, żeby to był wciąż ten sam trening. */
const SAME_MOMENT_MS = 120_000;

/** Aktywności zaczynające się w tej samej chwili co któryś ze znanych nam już wpisów. */
export function sameMoment(
  activities: WatchActivity[],
  known: { startTime: string }[],
): Set<string> {
  const stamps = known.map((entry) => Date.parse(entry.startTime));
  return new Set(
    activities
      .filter((activity) =>
        stamps.some((stamp) => Math.abs(stamp - Date.parse(activity.startTime)) <= SAME_MOMENT_MS),
      )
      .map((activity) => activity.recordId),
  );
}

/**
 * Aktywności rozliczone pod innym identyfikatorem: pokrywają się z treningiem, który już z jakiejś
 * aktywności powstał albo został do niej dopięty.
 */
export function alreadySettled(activities: WatchActivity[], sessions: SessionWindow[]): Set<string> {
  const linked = sessions.filter((session) => session.linked);
  return new Set(
    activities
      .filter((activity) => findOverlappingSession(activity, linked) !== null)
      .map((activity) => activity.recordId),
  );
}

const statusOf = (recordId: string, imported: Set<string>, archived: Set<string>): ActivityStatus => {
  if (imported.has(recordId)) return 'IMPORTED';
  if (archived.has(recordId)) return 'ARCHIVED';
  return 'NEW';
};

/** Podpis statusu na spisie. */
export const STATUS_LABELS: Record<ActivityStatus, string> = {
  NEW: 'Do wczytania',
  IMPORTED: 'W historii',
  ARCHIVED: 'Odłożony',
};
