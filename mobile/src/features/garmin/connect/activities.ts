import type { Sport } from '@/db/schema';
import type { WatchActivity } from '@/features/activities/mapping';

import { connectApi } from './client';

/**
 * Aktywności czytane wprost z Garmin Connect — tą samą drogą, którą wysyłamy tam plany.
 *
 * Wcześniej szły przez systemowy Health Connect, ale to Garmin Connect decyduje, co tam zapisze,
 * i potrafi pominąć trening bez żadnego śladu — czego po naszej stronie nie da się naprawić.
 * Pytamy więc Garmina bezpośrednio, tym samym połączeniem, którym wysyłamy plany.
 *
 * Serii i powtórzeń ta lista nie zawiera: zegarek liczy je tylko w aktywności siłowej prowadzonej
 * po krokach wczytanego treningu i nie udostępnia ich dalej.
 */

const ACTIVITY_LIST = '/activitylist-service/activities/search/activities';

/**
 * Surowa pozycja listy aktywności. API nie jest dokumentowane, więc każde pole traktujemy jako
 * możliwe do zniknięcia — brakujące dane mają dać trening bez pomiaru, a nie wywrócić odczyt.
 */
export type GarminActivityRow = {
  activityId?: number | null;
  activityName?: string | null;
  startTimeGMT?: string | null;
  startTimeLocal?: string | null;
  duration?: number | null;
  elapsedDuration?: number | null;
  distance?: number | null;
  averageHR?: number | null;
  maxHR?: number | null;
  calories?: number | null;
  activityType?: { typeKey?: string | null } | null;
};

/**
 * Czas z Garmina przychodzi jako „2026-10-09 16:12:34” bez znacznika strefy — w `startTimeGMT`
 * jest to czas UTC. Bez dopisanego „Z” silnik JavaScriptu wolno może uznać go za czas lokalny,
 * a wtedy trening przeskoczyłby o kilka godzin i wylądował w złym dniu kalendarza.
 */
export function parseGarminTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim().replace(' ', 'T');
  const stamped = /(Z|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`;
  const time = Date.parse(stamped);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * Dyscyplina z klucza typu Garmina. Garmin ma ich kilkadziesiąt i dokłada nowe, więc zamiast
 * pełnego słownika patrzymy na rdzeń nazwy — `trail_running`, `treadmill_running` i `virtual_run`
 * to wszystko bieganie. Marsz i wędrówkę też liczymy jako bieganie, bo mierzy się je tak samo —
 * dystansem i tempem — a osobnego sportu dla chodzenia aplikacja nie ma. Czego nie rozpoznamy,
 * trafia do „Różnych”, a nie do siły, żeby nie psuć tonażu ani rekordów.
 */
export function garminSport(typeKey: string | null | undefined): Sport {
  const key = (typeKey ?? '').toLowerCase();
  if (key.includes('swim')) return 'SWIMMING';
  if (key.includes('cycling') || key.includes('biking') || key.includes('ride')) return 'CYCLING';
  if (key.includes('running') || key.includes('run') || key === 'walking' || key === 'hiking') {
    return 'RUNNING';
  }
  if (key.includes('strength')) return 'STRENGTH';
  return 'OTHER';
}

/** Nazwa zapasowa, gdy aktywność nie ma własnej — ogólna, ale zgodna z dyscypliną. */
const FALLBACK_NAMES: Record<Sport, string> = {
  STRENGTH: 'Trening siłowy',
  RUNNING: 'Bieganie',
  CYCLING: 'Jazda na rowerze',
  SWIMMING: 'Pływanie',
  OTHER: 'Trening',
};

/**
 * Składa aktywność z pozycji listy Garmina. Zwraca null dla wiersza bez identyfikatora albo bez
 * czasu startu — bez nich nie odróżnilibyśmy jej od innych ani nie wiedzieli, gdzie ją zapisać.
 */
export function toActivityFromGarmin(row: GarminActivityRow): WatchActivity | null {
  const startTime = parseGarminTime(row.startTimeGMT ?? row.startTimeLocal);
  if (row.activityId === null || row.activityId === undefined || startTime === null) return null;

  const sport = garminSport(row.activityType?.typeKey);
  const seconds = Math.max(Math.round(row.duration ?? row.elapsedDuration ?? 0), 0);
  // Dystans zero to trening siłowy albo joga, a nie przebyte zero metrów — lepiej nie pokazywać go
  // wcale niż wypisywać „0,00 km”.
  const meters = row.distance ?? 0;

  return {
    // Numer z Garmina zapisujemy z przedrostkiem: w bazie leżą obok identyfikatorów rekordów, które
    // wczytała wcześniejsza droga przez Health Connect, a te wpisy muszą zostać rozpoznawalne.
    recordId: `garmin:${row.activityId}`,
    title: row.activityName?.trim() || FALLBACK_NAMES[sport],
    sport,
    startTime,
    endTime: new Date(Date.parse(startTime) + seconds * 1000).toISOString(),
    durationSeconds: seconds,
    distanceMeters: meters > 0 ? meters : null,
    avgHeartRate: row.averageHR ?? null,
    maxHeartRate: row.maxHR ?? null,
    caloriesBurned: row.calories ?? null,
  };
}

/**
 * Aktywności z Garmin Connect z ostatnich `days` dni. Pobieramy jedną stronę listy i obcinamy ją
 * do okna czasowego — zegarek nie nagrywa dziesiątek treningów dziennie, a pełne przewijanie
 * historii kosztowałoby kilka zapytań przy każdym dotknięciu przycisku.
 */
export async function fetchGarminActivities(days: number, now: Date = new Date()): Promise<WatchActivity[]> {
  const rows = (await connectApi<GarminActivityRow[]>(`${ACTIVITY_LIST}?start=0&limit=50`)) ?? [];
  const from = now.getTime() - days * 24 * 3600 * 1000;
  return rows
    .map(toActivityFromGarmin)
    .filter((activity): activity is WatchActivity => activity !== null)
    .filter((activity) => Date.parse(activity.startTime) >= from);
}
