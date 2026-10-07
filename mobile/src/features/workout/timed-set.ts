import { getSetting, setSetting } from '@/db/settings';
import type { SyncDb } from '@/db/types';

/**
 * Seria na czas — plank, wisienie na drążku, izometria. Zamiast wpisywać czas po fakcie,
 * użytkownik odpala odliczanie i słyszy końcówkę; wynik wpisuje się sam.
 *
 * Trwające odliczanie trzymamy jako znacznik czasu w bazie, nie jako licznik w pamięci. Android
 * usypia aplikację i zatrzymuje liczniki JS (R5 w planie), więc licznik w pamięci zgubiłby
 * sekundy dokładnie wtedy, gdy telefon leży obok ćwiczącego z wygaszonym ekranem.
 */

const KEY = 'timed_set';

/**
 * Po godzinie od końca uznajemy odliczanie za porzucone. Licznik czeka na zapisanie serii, ale
 * nie w nieskończoność: wrócenie do aplikacji nazajutrz nie ma proponować zapisania planku,
 * o którym nikt już nie pamięta.
 */
const STALE_AFTER_MS = 60 * 60 * 1000;

export type TimedSet = { setId: number; startedAt: string; seconds: number };

export type TimedSetState = {
  setId: number;
  totalSeconds: number;
  endsAt: number;
  /** Ujemne po przekroczeniu zera — ekran decyduje, co z tym zrobić. */
  remainingSeconds: number;
  /** Ile już wytrzymano, nigdy więcej niż zaplanowano. */
  elapsedSeconds: number;
};

export function startTimedSet(
  db: SyncDb,
  setId: number,
  seconds: number,
  now = new Date().toISOString(),
): void {
  setSetting(db, KEY, JSON.stringify({ setId, startedAt: now, seconds } satisfies TimedSet));
}

export function clearTimedSet(db: SyncDb): void {
  setSetting(db, KEY, null);
}

/** Zapisane odliczanie albo null. Uszkodzony wpis traktujemy jak brak — nie wywracamy treningu. */
export function loadTimedSet(db: SyncDb): TimedSet | null {
  const raw = getSetting(db, KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TimedSet>;
    if (typeof value.setId !== 'number' || typeof value.startedAt !== 'string') return null;
    if (typeof value.seconds !== 'number' || !(value.seconds > 0)) return null;
    return { setId: value.setId, startedAt: value.startedAt, seconds: value.seconds };
  } catch {
    return null;
  }
}

/** Stan odliczania wyliczony ze znacznika czasu. Null, gdy nic nie trwa albo wpis jest przeterminowany. */
export function timedSetState(stored: TimedSet | null, now: number): TimedSetState | null {
  if (!stored) return null;
  const startedAt = Date.parse(stored.startedAt);
  if (Number.isNaN(startedAt)) return null;
  const endsAt = startedAt + stored.seconds * 1000;
  if (now - endsAt > STALE_AFTER_MS) return null;
  return {
    setId: stored.setId,
    totalSeconds: stored.seconds,
    endsAt,
    remainingSeconds: Math.ceil((endsAt - now) / 1000),
    elapsedSeconds: Math.min(stored.seconds, Math.max(0, Math.floor((now - startedAt) / 1000))),
  };
}
