import type { Sport } from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { sportRecords } from '@/features/endurance/records';
import { loadEnduranceWorkouts, monthlyVolume } from '@/features/endurance/stats';
import { listGarminRecords } from '@/features/garmin/records-store';

/**
 * To, czego nie ma w briefie, a trener-człowiek pytałby o to pierwsze: na co Cię dziś stać
 * i ile biegałeś przez ostatni rok.
 *
 * Brief mówi o najbliższych tygodniach — tyle wystarczy regułom, bo one tylko rosną od obecnej
 * objętości. Modelowi to za mało: bez rekordów nie wie, czy czas docelowy jest marzeniem, czy
 * formalnością, a bez roku wstecz nie odróżni powrotu po przerwie od sezonu w pełni. Obie te
 * rzeczy zmieniają plan bardziej niż cokolwiek w regułach.
 */

export type PromptContext = {
  /** Rekordy policzone z historii w telefonie. */
  records: { meters: number; seconds: number }[];
  /** Rekordy życiowe prowadzone przez Garmina — sięgają dalej niż wczytana historia. */
  garmin: { label: string; meters: number | null; seconds: number | null; achievedOn: string | null }[];
  /** Objętość miesiąc po miesiącu, od najstarszego. */
  monthly: { month: string; meters: number }[];
  /** Wytyczne wpisane ręcznie w ustawieniach planisty. */
  guidance: string;
};

export const EMPTY_CONTEXT: PromptContext = { records: [], garmin: [], monthly: [], guidance: '' };

/** Ile miesięcy historii pokazujemy. Rok obejmuje pełen sezon razem z zimową przerwą. */
export const CONTEXT_MONTHS = 12;

/**
 * Wytyczne przychodzą tu gotowe, a nie są czytane w środku: inaczej ten moduł ciągnąłby za sobą
 * bazę na telefonie i nie dałoby się go sprawdzić testem bez uruchamiania SQLite z Expo.
 */
export function buildContext(
  db: SyncDb,
  sport: Sport,
  guidance: string,
  now: Date = new Date(),
): PromptContext {
  const workouts = loadEnduranceWorkouts(db, sport);
  const records = sportRecords(workouts, sport);

  return {
    records: records.efforts.map((effort) => ({ meters: effort.meters, seconds: effort.seconds })),
    garmin: listGarminRecords(db, sport).map((record) => ({
      label: record.label,
      meters: record.distanceMeters,
      seconds: record.seconds,
      achievedOn: record.achievedOn,
    })),
    monthly: monthlyVolume(workouts, CONTEXT_MONTHS, now).map((month) => ({
      month: month.month,
      meters: Math.round(month.meters),
    })),
    guidance: guidance.trim(),
  };
}
