import { getSetting, setSetting } from '@/db/settings';
import type { SyncDb } from '@/db/types';

/**
 * To, czego aplikacja nie wyliczy z treningów: rok urodzenia, płeć i wzrost. Nie są pomiarami,
 * więc nie leżą w `body_measurements` razem z wagą i obwodami — nie zmieniają się co tydzień i nie
 * ma sensu ich mierzyć. Zwykłe ustawienia wystarczają.
 *
 * Z roku urodzenia trzymamy sam rok, nie pełną datę: do planu i do stref tętna liczy się wiek
 * z dokładnością do roku, a pytanie o dzień i miesiąc byłoby pytaniem o dane, których nie ma po co
 * przechowywać. Płeć i wzrost wchodzą do wzoru na przemianę podstawową — bez nich budżet kalorii
 * byłby zgadywaniem, a wzór nie zna trzeciej odpowiedzi, więc jej nie udajemy.
 */

export const BIRTH_YEAR_KEY = 'user_birth_year';

/** Granice sensownego roku urodzenia. Reszta to literówka, nie stulatek z zegarkiem. */
const RANGE = { min: 1920, max: 2020 };

export function birthYear(db: SyncDb): number | null {
  const raw = Number(getSetting(db, BIRTH_YEAR_KEY));
  if (!Number.isInteger(raw) || raw < RANGE.min || raw > RANGE.max) return null;
  return raw;
}

export class BirthYearError extends Error {}

export function saveBirthYear(db: SyncDb, year: number | null): void {
  if (year === null) {
    setSetting(db, BIRTH_YEAR_KEY, null);
    return;
  }
  if (!Number.isInteger(year) || year < RANGE.min || year > RANGE.max) {
    throw new BirthYearError(`Rok urodzenia musi być z zakresu ${RANGE.min}–${RANGE.max}.`);
  }
  setSetting(db, BIRTH_YEAR_KEY, String(year));
}

/**
 * Płeć w rozumieniu wzoru na przemianę podstawową. Mifflin–St Jeor zna dwie wartości i różnią się
 * one o 166 kcal — kto chce innego budżetu, wpisuje go ręcznie w ustawieniach kalorii.
 */
export const sexes = ['MALE', 'FEMALE'] as const;
export type Sex = (typeof sexes)[number];

export const SEX_LABELS: Record<Sex, string> = {
  MALE: 'mężczyzna',
  FEMALE: 'kobieta',
};

export const SEX_KEY = 'user_sex';
export const HEIGHT_KEY = 'user_height_cm';

/** Granice sensownego wzrostu w centymetrach. */
const HEIGHT_RANGE = { min: 120, max: 230 };

export function sex(db: SyncDb): Sex | null {
  const raw = getSetting(db, SEX_KEY);
  return sexes.find((value) => value === raw) ?? null;
}

export function saveSex(db: SyncDb, value: Sex | null): void {
  setSetting(db, SEX_KEY, value);
}

export class HeightError extends Error {}

export function heightCm(db: SyncDb): number | null {
  const raw = Number(getSetting(db, HEIGHT_KEY));
  if (!Number.isFinite(raw) || raw < HEIGHT_RANGE.min || raw > HEIGHT_RANGE.max) return null;
  return raw;
}

export function saveHeight(db: SyncDb, centimeters: number | null): void {
  if (centimeters === null) {
    setSetting(db, HEIGHT_KEY, null);
    return;
  }
  if (!Number.isFinite(centimeters) || centimeters < HEIGHT_RANGE.min || centimeters > HEIGHT_RANGE.max) {
    throw new HeightError(`Wzrost musi być z zakresu ${HEIGHT_RANGE.min}–${HEIGHT_RANGE.max} cm.`);
  }
  setSetting(db, HEIGHT_KEY, String(Math.round(centimeters)));
}

/** Wiek w pełnych latach; null, gdy roku nie podano. Bez dnia urodzin myli się najwyżej o rok. */
export function age(db: SyncDb, now: Date = new Date()): number | null {
  const year = birthYear(db);
  return year === null ? null : now.getFullYear() - year;
}

/**
 * Szacowane tętno maksymalne ze wzoru 220 minus wiek. Przybliżenie dla całej populacji —
 * rozrzut między ludźmi w tym samym wieku sięga kilkunastu uderzeń, więc do strefowania
 * lepszy jest pomiar z testu niż ta liczba. Pokazujemy ją jako punkt odniesienia, nie wyrok.
 */
export const estimatedMaxHeartRate = (years: number): number => 220 - years;
