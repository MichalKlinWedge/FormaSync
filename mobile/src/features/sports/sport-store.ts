import { create } from 'zustand';

import { db } from '@/db/client';
import type { Sport } from '@/db/schema';
import { getSetting, setSetting } from '@/db/settings';

import { ACTIVE_SPORT_KEY, isSport } from './sport';

function getActiveSport(): Sport {
  try {
    const stored = getSetting(db, ACTIVE_SPORT_KEY);
    return isSport(stored) ? stored : 'STRENGTH';
  } catch {
    // Odczyt sprzed migracji (świeża instalacja) — wybór dojdzie przez hydrate() po starcie bazy.
    return 'STRENGTH';
  }
}

type SportState = {
  sport: Sport;
  /** Czy kalendarz pokazuje wszystkie sporty, czy tylko wybrany. Nie zapisujemy tego
   *  w ustawieniach — to wybór na chwilę, inny przy przeglądaniu niż przy planowaniu. */
  calendarShowsAll: boolean;
  select: (sport: Sport) => void;
  setCalendarShowsAll: (all: boolean) => void;
  /** Wczytuje zapisany wybór po migracjach — przy starcie modułu bazy jeszcze nie ma. */
  hydrate: () => void;
};

/**
 * Wybrany sport w jednym miejscu, żeby przełączenie odświeżyło wszystkie ekrany naraz.
 * Wartość wyjściowa pochodzi z bazy, a każda zmiana wraca do niej z powrotem.
 */
export const useSportStore = create<SportState>((set) => ({
  sport: getActiveSport(),
  calendarShowsAll: true,
  select: (sport) => {
    setSetting(db, ACTIVE_SPORT_KEY, sport);
    set({ sport });
  },
  setCalendarShowsAll: (calendarShowsAll) => set({ calendarShowsAll }),
  hydrate: () => set({ sport: getActiveSport() }),
}));

export const useActiveSport = (): Sport => useSportStore((state) => state.sport);
