import type { GoalPhase, GoalWorkoutKind, Sport } from '@/db/schema';
import { addDays, fromDateKey, startOfWeek } from '@/lib/date';

import { durationFrom, paceFor, racePace } from './paces';
import { KIND_NOTES, workoutTitle } from './shapes';

/**
 * Układanie planu pod zawody z reguł periodyzacji. Działa bez internetu i bez żadnego modelu,
 * więc jest domyślnym planistą; model dokłada drugą opcję za tym samym interfejsem.
 *
 * Reguły są te, które w praktyce treningowej powtarzają się we wszystkich planach dla amatorów:
 * objętość rośnie łagodnie, co czwarty tydzień jest lżejszy, przed startem dwa tygodnie zejścia,
 * a najdłuższa jednostka to ułamek dystansu zawodów. Liczby poniżej to reguły orientacyjne —
 * nie zastąpią trenera, który widzi, jak znosisz obciążenie.
 */

/** Dyscypliny, w których cel ma sens: mierzone dystansem i tempem. */
export const GOAL_SPORTS: Sport[] = ['RUNNING', 'CYCLING', 'SWIMMING'];

const MAX_WEEKS = 52;
/** Najwięcej, o ile wolno podnieść objętość tydzień do tygodnia. */
const WEEKLY_STEP_CAP = 1.1;
/** Co czwarty tydzień obciążeniowy jest lżejszy — bez tego nie ma z czego się regenerować. */
const RECOVERY_FACTOR = 0.7;
/** Długa jednostka to dwie piąte tygodnia. */
const LONG_SHARE = 0.4;
/** Jednostka z intensywnością: nieco ponad piąta część tygodnia. */
const QUALITY_SHARE = 0.22;
/** Objętości nie podwaja się bezpiecznie w jednym cyklu, choćby zostało na to pół roku. */
const PEAK_OVER_BASE = 2;
/** Dwa tygodnie przed startem: zejście z objętości przy zachowanej intensywności. */
const TAPER_FACTORS = [0.6, 0.45];
/** Tydzień startowy poza samym startem — tylko rozruch. */
const RACE_WEEK_SHARE = 0.35;
/** W tygodniu roztrenowania długa jednostka też się skraca. */
const TAPER_LONG_SHARE = 0.45;

/**
 * Najdłuższa jednostka jako ułamek dystansu zawodów. Biegacz maratonu nie przebiega na treningu
 * pełnego dystansu, pływak spokojnie przepłynie więcej niż na starcie, a rowerzysta jeździ
 * dłużej niż wyścig. Sufit dla biegania bierze się stąd, że powyżej trzydziestu kilometrów
 * rośnie już samo ryzyko, a nie forma.
 */
const LONG_LIMITS: Partial<Record<Sport, { share: number; capMeters: number }>> = {
  RUNNING: { share: 0.85, capMeters: 32000 },
  CYCLING: { share: 1, capMeters: 200000 },
  SWIMMING: { share: 1.2, capMeters: 6000 },
};

/** Do pełnych pięciuset metrów, a w pływaniu do stu — plan to nie wynik pomiaru. */
const ROUND_TO: Partial<Record<Sport, number>> = { RUNNING: 500, CYCLING: 1000, SWIMMING: 100 };

export type GoalBrief = {
  sport: Sport;
  title: string;
  distanceMeters: number;
  eventDate: string;
  targetSeconds: number | null;
  /** Dni tygodnia, w które da się trenować; 0 = poniedziałek. */
  weekDays: number[];
  /** Obecna objętość tygodniowa z historii. Zero znaczy „brak historii”. */
  weeklyMeters: number;
  /** Najlepsze tempo z historii, w sekundach na kilometr. */
  bestPaceSeconds: number | null;
  /** Wiek w latach; null, gdy nie podano roku urodzenia. Reguły go nie używają — żadna z nich
   *  nie zależy od wieku — ale planista AI dostaje go w briefie. */
  age: number | null;
};

export type PlannedWorkout = {
  weekIndex: number;
  phase: GoalPhase;
  plannedDate: string;
  kind: GoalWorkoutKind;
  title: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  paceSeconds: number | null;
  notes: string | null;
};

export type PlannedWeek = {
  weekIndex: number;
  startDate: string;
  phase: GoalPhase;
  /** Tydzień lżejszy w cyklu obciążeń. */
  recovery: boolean;
  targetMeters: number;
  workouts: PlannedWorkout[];
};

/** Ile tygodni dzieli start od tygodnia zawodów; zero, gdy zawody już były. */
export function weeksUntil(from: string, eventDate: string): number {
  const first = fromDateKey(startOfWeek(from)).getTime();
  const race = fromDateKey(startOfWeek(eventDate)).getTime();
  if (race < first) return 0;
  // Zaokrąglenie zdejmuje godzinę, którą dokłada zmiana czasu w środku okresu.
  return Math.round((race - first) / (7 * 24 * 3600 * 1000)) + 1;
}

/** Fazy kolejnych tygodni. Start zawsze ostatni, przed nim roztrenowanie, resztę dzielimy. */
export function phasesFor(weeks: number): GoalPhase[] {
  if (weeks <= 0) return [];
  if (weeks === 1) return ['RACE'];
  if (weeks === 2) return ['TAPER', 'RACE'];

  const taper = weeks >= 4 ? 2 : 1;
  const loading = weeks - 1 - taper;
  const phases: GoalPhase[] = [];

  if (loading === 1) phases.push('BUILD');
  else if (loading === 2) phases.push('BASE', 'BUILD');
  else {
    const base = Math.max(1, Math.round(loading * 0.4));
    const peak = Math.max(1, Math.round(loading * 0.2));
    const build = loading - base - peak;
    phases.push(
      ...Array<GoalPhase>(base).fill('BASE'),
      ...Array<GoalPhase>(build).fill('BUILD'),
      ...Array<GoalPhase>(peak).fill('PEAK'),
    );
  }

  phases.push(...Array<GoalPhase>(taper).fill('TAPER'), 'RACE');
  return phases;
}

/** Najdłuższa jednostka, na jaką pozwala dystans zawodów. */
export function longCapFor(sport: Sport, distanceMeters: number): number {
  const limits = LONG_LIMITS[sport];
  if (limits === undefined) return distanceMeters;
  return Math.min(distanceMeters * limits.share, limits.capMeters);
}

const roundDistance = (sport: Sport, meters: number): number => {
  const step = ROUND_TO[sport] ?? 500;
  return Math.max(step, Math.round(meters / step) * step);
};

/**
 * Objętość tygodniowa w kolejnych tygodniach. Wychodzimy od tego, co biegasz teraz, i rośniemy
 * w stronę szczytu — nie szybciej niż o dziesięć procent na tydzień i nie dalej niż do podwojenia
 * obecnej objętości, choćby kalendarz dawał na to pół roku.
 */
export function weeklyVolumes(brief: GoalBrief, phases: GoalPhase[]): number[] {
  // Bez historii zakładamy jeden dystans zawodów na tydzień: skromnie, ale nie od zera.
  const base = brief.weeklyMeters > 0 ? brief.weeklyMeters : brief.distanceMeters;
  const peak = Math.max(base, Math.min(longCapFor(brief.sport, brief.distanceMeters) / LONG_SHARE, base * PEAK_OVER_BASE));

  const loading = phases.filter((phase) => phase !== 'TAPER' && phase !== 'RACE').length;
  const volumes: number[] = [];
  let previousLoad = base;
  let loadIndex = 0;
  let reached = base;
  let taperIndex = 0;

  for (const phase of phases) {
    if (phase === 'RACE') {
      volumes.push(reached * RACE_WEEK_SHARE);
      continue;
    }
    if (phase === 'TAPER') {
      volumes.push(reached * (TAPER_FACTORS[taperIndex] ?? TAPER_FACTORS[TAPER_FACTORS.length - 1]));
      taperIndex += 1;
      continue;
    }

    const progress = loading <= 1 ? 1 : loadIndex / (loading - 1);
    const target = Math.min(base + (peak - base) * progress, previousLoad * WEEKLY_STEP_CAP);
    const recovery = loadIndex % 4 === 3;
    volumes.push(recovery ? target * RECOVERY_FACTOR : target);
    // Tydzień lżejszy nie zeruje progresji: następny wraca do linii, z której zszedł.
    previousLoad = target;
    reached = Math.max(reached, target);
    loadIndex += 1;
  }

  return volumes;
}

/** Dzień długiej jednostki i dzień jakościowej. Reszta dostępnych dni to spokojne. */
export function assignDays(weekDays: number[]): { long: number; quality: number | null } {
  const days = [...new Set(weekDays)].sort((a, b) => a - b);
  if (days.length === 0) return { long: 6, quality: null };
  // Długa jednostka na ostatni dostępny dzień: zwykle weekend, kiedy jest na nią czas.
  const long = days[days.length - 1];
  const rest = days.filter((day) => day !== long);
  if (rest.length === 0) return { long, quality: null };
  // Jakość w środku tygodnia, licząc od środy. Przy remisie wygrywa dzień późniejszy: po długiej
  // jednostce z poprzedniego weekendu lepiej mieć więcej odstępu, niż zostawiać go przed następną.
  const quality = rest.reduce((best, day) => (Math.abs(day - 2) <= Math.abs(best - 2) ? day : best), rest[0]);
  return { long, quality };
}

/** Rodzaj jednostki jakościowej. Baza buduje tempo, budowanie i szczyt dokładają interwały. */
export function qualityKind(phase: GoalPhase, weekIndex: number): GoalWorkoutKind {
  if (phase === 'PEAK') return 'INTERVALS';
  if (phase === 'BUILD') return weekIndex % 2 === 0 ? 'INTERVALS' : 'TEMPO';
  return 'TEMPO';
}

function makeWorkout(
  brief: GoalBrief,
  weekIndex: number,
  phase: GoalPhase,
  plannedDate: string,
  kind: GoalWorkoutKind,
  meters: number,
  pace: number | null,
): PlannedWorkout {
  const distanceMeters = roundDistance(brief.sport, meters);
  const paceSeconds = paceFor(kind, pace);
  return {
    weekIndex,
    phase,
    plannedDate,
    kind,
    title: workoutTitle(kind, brief.sport, distanceMeters, brief.title),
    distanceMeters,
    durationSeconds: durationFrom(distanceMeters, paceSeconds),
    paceSeconds,
    notes: KIND_NOTES[kind],
  };
}

/**
 * Cały plan: tygodnie od najbliższego poniedziałku do tygodnia zawodów. Puste, gdy zawody już
 * były albo gdy dyscyplina nie mierzy się dystansem.
 */
export function planGoal(brief: GoalBrief, from: string): PlannedWeek[] {
  if (!GOAL_SPORTS.includes(brief.sport) || brief.distanceMeters <= 0) return [];

  const span = weeksUntil(from, brief.eventDate);
  if (span === 0) return [];

  const weeks = Math.min(span, MAX_WEEKS);
  // Przy bardzo odległym starcie plan zaczyna się później: rok przygotowań ma sens, pięć nie ma.
  const firstMonday = addDays(startOfWeek(brief.eventDate), -(weeks - 1) * 7);
  const phases = phasesFor(weeks);
  const volumes = weeklyVolumes(brief, phases);
  const pace = racePace(brief.distanceMeters, brief.targetSeconds, brief.bestPaceSeconds);
  const longCap = longCapFor(brief.sport, brief.distanceMeters);
  const { long: longDay, quality: qualityDay } = assignDays(brief.weekDays);

  return phases.map((phase, weekIndex) => {
    const startDate = addDays(firstMonday, weekIndex * 7);
    const targetMeters = volumes[weekIndex];
    const workouts =
      phase === 'RACE'
        ? raceWeek(brief, weekIndex, startDate, targetMeters, pace)
        : loadingWeek(brief, weekIndex, phase, startDate, targetMeters, longCap, longDay, qualityDay, pace);

    return {
      weekIndex,
      startDate,
      phase,
      recovery: phase !== 'RACE' && phase !== 'TAPER' && weekIndex % 4 === 3,
      targetMeters: Math.round(targetMeters),
      workouts,
    };
  });
}

function loadingWeek(
  brief: GoalBrief,
  weekIndex: number,
  phase: GoalPhase,
  startDate: string,
  targetMeters: number,
  longCap: number,
  longDay: number,
  qualityDay: number | null,
  pace: number | null,
): PlannedWorkout[] {
  const longShare = phase === 'TAPER' ? TAPER_LONG_SHARE : LONG_SHARE;
  const longMeters = Math.min(targetMeters * longShare, longCap);
  const qualityMeters = qualityDay === null ? 0 : targetMeters * QUALITY_SHARE;

  const workouts: PlannedWorkout[] = [
    makeWorkout(brief, weekIndex, phase, addDays(startDate, longDay), 'LONG', longMeters, pace),
  ];

  if (qualityDay !== null) {
    const kind = qualityKind(phase, weekIndex);
    workouts.push(
      makeWorkout(brief, weekIndex, phase, addDays(startDate, qualityDay), kind, qualityMeters, pace),
    );
  }

  const easyDays = [...new Set(brief.weekDays)]
    .sort((a, b) => a - b)
    .filter((day) => day !== longDay && day !== qualityDay);
  const left = targetMeters - longMeters - qualityMeters;
  if (easyDays.length > 0 && left > 0) {
    const each = left / easyDays.length;
    for (const day of easyDays) {
      workouts.push(
        makeWorkout(brief, weekIndex, phase, addDays(startDate, day), 'EASY', each, pace),
      );
    }
  }

  return workouts.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
}

/** Tydzień startowy: zawody w swoim dniu, przed nimi najwyżej dwa krótkie rozruchy. */
function raceWeek(
  brief: GoalBrief,
  weekIndex: number,
  startDate: string,
  targetMeters: number,
  pace: number | null,
): PlannedWorkout[] {
  const race = makeWorkout(
    brief,
    weekIndex,
    'RACE',
    brief.eventDate,
    'RACE',
    brief.distanceMeters,
    pace,
  );

  const before = [...new Set(brief.weekDays)]
    .sort((a, b) => a - b)
    .map((day) => addDays(startDate, day))
    .filter((date) => date < brief.eventDate)
    .slice(-2);

  const each = before.length === 0 ? 0 : targetMeters / before.length;
  const warmups = before.map((date) =>
    makeWorkout(brief, weekIndex, 'RACE', date, 'EASY', each, pace),
  );

  return [...warmups, race];
}
