import type { GoalWorkoutKind, Sport } from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { sportRecords } from '@/features/endurance/records';
import { loadEnduranceWorkouts, monthlyVolume } from '@/features/endurance/stats';
import { listGarminRecords } from '@/features/garmin/records-store';
import { toDateKey } from '@/lib/date';

/**
 * To, czego nie ma w briefie, a trener-człowiek pytałby o to pierwsze: na co Cię dziś stać
 * i ile biegałeś przez ostatni rok.
 *
 * Brief mówi o najbliższych tygodniach — tyle wystarczy regułom, bo one tylko rosną od obecnej
 * objętości. Modelowi to za mało: bez rekordów nie wie, czy czas docelowy jest marzeniem, czy
 * formalnością, a bez roku wstecz nie odróżni powrotu po przerwie od sezonu w pełni. Obie te
 * rzeczy zmieniają plan bardziej niż cokolwiek w regułach.
 */

/** Zaplanowana jednostka zestawiona z tym, co z niej wyszło. */
export type PlanResult = {
  date: string;
  kind: GoalWorkoutKind;
  plannedMeters: number;
  /** Null znaczy: tego dnia nic nie zapisano. */
  doneMeters: number | null;
  doneSeconds: number | null;
  /** Sekundy na kilometr z wykonania; null, gdy nie da się policzyć. */
  pace: number | null;
};

export type PromptContext = {
  /** Rekordy policzone z historii w telefonie. */
  records: { meters: number; seconds: number }[];
  /** Rekordy życiowe prowadzone przez Garmina — sięgają dalej niż wczytana historia. */
  garmin: { label: string; meters: number | null; seconds: number | null; achievedOn: string | null }[];
  /** Objętość miesiąc po miesiącu, od najstarszego. */
  monthly: { month: string; meters: number }[];
  /** Wytyczne wpisane ręcznie w ustawieniach planisty. */
  guidance: string;
  /** Jak poszło to, co już było zaplanowane w tym celu — od najstarszej jednostki. */
  results: PlanResult[];
};

export const EMPTY_CONTEXT: PromptContext = {
  records: [],
  garmin: [],
  monthly: [],
  guidance: '',
  results: [],
};

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
  results: PlanResult[] = [],
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
    results,
  };
}

/**
 * Realizacja dotychczasowego planu: co było zaplanowane w tym celu i co z tego wyszło.
 *
 * Bez tego korekta planu jest ślepa na własne skutki — model dostaje historię treningów, ale nie
 * wie, które z nich były jego jednostkami, a których nie wykonano wcale. A to właśnie opuszczone
 * i skrócone jednostki mówią, czy obciążenie było do udźwignięcia.
 *
 * Dopasowujemy po dniu: trening zapisany w dniu zaplanowanej jednostki jest jej wykonaniem.
 * Prościej się nie da i nie trzeba — dwóch treningów dziennie plan nie przewiduje.
 */
export function planResults(
  planned: { plannedDate: string; kind: GoalWorkoutKind; distanceMeters: number | null }[],
  done: { startTime: string; meters: number; seconds: number; pace: number | null }[],
  before: string,
): PlanResult[] {
  const byDay = new Map<string, (typeof done)[number]>();
  for (const workout of done) byDay.set(toDateKey(new Date(workout.startTime)), workout);

  return planned
    .filter((workout) => workout.plannedDate < before)
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
    .map((workout) => {
      const actual = byDay.get(workout.plannedDate);
      return {
        date: workout.plannedDate,
        kind: workout.kind,
        plannedMeters: Math.round(workout.distanceMeters ?? 0),
        doneMeters: actual === undefined ? null : Math.round(actual.meters),
        doneSeconds: actual === undefined ? null : Math.round(actual.seconds),
        pace: actual?.pace ?? null,
      };
    });
}
