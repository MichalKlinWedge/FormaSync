import { getSetting, setSetting } from '@/db/settings';
import type { SyncDb } from '@/db/types';

/**
 * Jedna rzecz o Tobie, której aplikacja nie wyliczy z treningów: rok urodzenia. Nie jest pomiarem,
 * więc nie leży w `body_measurements` razem z wagą i obwodami — nie zmienia się co tydzień i nie ma
 * sensu go mierzyć. Zwykłe ustawienie wystarcza.
 *
 * Trzymamy sam rok, nie pełną datę: do planu i do stref tętna liczy się wiek z dokładnością do
 * roku, a pytanie o dzień i miesiąc byłoby pytaniem o dane, których nie ma po co przechowywać.
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
