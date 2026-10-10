import { getSetting, setSetting } from '@/db/settings';
import type { SyncDb } from '@/db/types';

import {
  DEFAULT_EVERY_MINUTES,
  DEFAULT_PORTIONS_ML,
  DEFAULT_WINDOW,
  parseTime,
  type DayWindow,
} from './day';
import { EVERY_MINUTES_RANGE } from './schedule';

/**
 * Ustawienia nawodnienia w istniejącej tabeli klucz–wartość, tak jak długość basenu czy wybrany
 * sport. Odczyt jest wyrozumiały: wartość nie z tego świata — po ręcznej edycji kopii albo po
 * przywróceniu starszej — ma dać wartość domyślną, a nie zepsuty ekran.
 */

export const TARGET_KEY = 'hydration_target_ml';
export const WINDOW_FROM_KEY = 'hydration_window_from';
export const WINDOW_TO_KEY = 'hydration_window_to';
export const EVERY_KEY = 'hydration_every_minutes';
export const REMINDERS_KEY = 'hydration_reminders';
export const PORTIONS_KEY = 'hydration_portions';

export type HydrationSettings = {
  /** Stały cel dnia; null znaczy „policz z masy ciała”. */
  manualMl: number | null;
  window: DayWindow;
  everyMinutes: number;
  reminders: boolean;
  portions: number[];
};

export type RawHydrationSettings = {
  target?: string | null;
  from?: string | null;
  to?: string | null;
  every?: string | null;
  reminders?: string | null;
  portions?: string | null;
};

/** Najmniejsza i największa porcja, jaką przyjmiemy z przycisku albo z ustawień. */
const PORTION_RANGE = { min: 50, max: 2000 };

function positiveInt(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Porcje zapisujemy jako liczby rozdzielone spacją — lista krótka, formatu nie trzeba mnożyć. */
export const serializePortions = (portions: number[]): string => portions.join(' ');

function parsePortions(value: string | null | undefined): number[] {
  const parsed = (value ?? '')
    .split(/\s+/)
    .map((part) => positiveInt(part))
    .filter(
      (ml): ml is number => ml !== null && ml >= PORTION_RANGE.min && ml <= PORTION_RANGE.max,
    );
  return parsed.length > 0 ? parsed : DEFAULT_PORTIONS_ML;
}

export function hydrationSettingsFrom(raw: RawHydrationSettings): HydrationSettings {
  const every = positiveInt(raw.every);
  const from = parseTime(raw.from) === null ? DEFAULT_WINDOW.from : (raw.from as string);
  const to = parseTime(raw.to) === null ? DEFAULT_WINDOW.to : (raw.to as string);

  return {
    manualMl: positiveInt(raw.target),
    // Okno, które się domyka, nie przypomniałoby nigdy — wracamy wtedy do domyślnego.
    window: (parseTime(to) ?? 0) > (parseTime(from) ?? 0) ? { from, to } : DEFAULT_WINDOW,
    everyMinutes:
      every !== null && every >= EVERY_MINUTES_RANGE.min && every <= EVERY_MINUTES_RANGE.max
        ? every
        : DEFAULT_EVERY_MINUTES,
    // Domyślnie włączone: o pilnowanie właśnie chodzi, a wyłącznik jest w Ustawieniach.
    reminders: raw.reminders !== 'off',
    portions: parsePortions(raw.portions),
  };
}

export function loadHydrationSettings(db: SyncDb): HydrationSettings {
  return hydrationSettingsFrom({
    target: getSetting(db, TARGET_KEY),
    from: getSetting(db, WINDOW_FROM_KEY),
    to: getSetting(db, WINDOW_TO_KEY),
    every: getSetting(db, EVERY_KEY),
    reminders: getSetting(db, REMINDERS_KEY),
    portions: getSetting(db, PORTIONS_KEY),
  });
}

export function saveHydrationSettings(db: SyncDb, patch: Partial<HydrationSettings>): void {
  if ('manualMl' in patch) {
    setSetting(db, TARGET_KEY, patch.manualMl === null ? null : String(patch.manualMl));
  }
  if (patch.window !== undefined) {
    setSetting(db, WINDOW_FROM_KEY, patch.window.from);
    setSetting(db, WINDOW_TO_KEY, patch.window.to);
  }
  if (patch.everyMinutes !== undefined) setSetting(db, EVERY_KEY, String(patch.everyMinutes));
  if (patch.reminders !== undefined) {
    setSetting(db, REMINDERS_KEY, patch.reminders ? 'on' : 'off');
  }
  if (patch.portions !== undefined) {
    setSetting(db, PORTIONS_KEY, serializePortions(patch.portions));
  }
}
