import type { GoalWorkoutKind, Sport } from '@/db/schema';
import { createSegment, type EnduranceDraft, type SegmentDraft } from '@/features/endurance/draft';

import { paceRange } from './paces';
import { COOLDOWN_SECONDS, intervalShape, RECOVERY_SECONDS, WARMUP_SECONDS } from './shapes';

/**
 * Zamiana jednostki planu na plan wytrzymałościowy z odcinkami. Dzięki temu cel długoterminowy
 * nie potrzebuje własnego modelu treningu: produkuje zwykłe plany, a te od razu działają
 * w kalendarzu, w przypomnieniach i przy wysyłce na zegarek.
 */

export type PlannedUnit = {
  kind: GoalWorkoutKind;
  title: string;
  distanceMeters: number | null;
  paceSeconds: number | null;
  notes: string | null;
};

/** Odcinek ciągły z widełkami tempa, gdy je znamy. */
function workSegment(meters: number, paceSeconds: number | null): SegmentDraft {
  const segment = { ...createSegment('WORK'), durationType: 'DISTANCE' as const, distanceMeters: meters };
  if (paceSeconds === null) return segment;
  const range = paceRange(paceSeconds);
  // Niższa liczba sekund to szybsze tempo, więc dolny koniec widełek jest tym szybszym.
  return { ...segment, targetType: 'PACE', targetLow: range.low, targetHigh: range.high };
}

const timeSegment = (kind: 'WARMUP' | 'COOLDOWN' | 'RECOVERY', seconds: number): SegmentDraft => ({
  ...createSegment(kind),
  durationType: 'TIME',
  durationSeconds: seconds,
});

/**
 * Odcinki jednostki. Spokojne i długie to jeden odcinek ciągły; tempo dostaje rozgrzewkę
 * i schłodzenie, a interwały dodatkowo grupę powtórzeń — bez rozgrzewki nikt ich nie robi.
 */
export function segmentsFor(unit: PlannedUnit, sport: Sport): SegmentDraft[] {
  const meters = unit.distanceMeters ?? 0;
  if (meters <= 0) return [];

  if (unit.kind === 'EASY' || unit.kind === 'LONG' || unit.kind === 'RACE') {
    return [workSegment(meters, unit.paceSeconds)];
  }

  if (unit.kind === 'TEMPO') {
    // Rozgrzewka i schłodzenie idą poza dystansem jednostki: liczą się na czas, nie na metry.
    return [
      timeSegment('WARMUP', WARMUP_SECONDS),
      workSegment(meters, unit.paceSeconds),
      timeSegment('COOLDOWN', COOLDOWN_SECONDS),
    ];
  }

  const shape = intervalShape(sport, meters);
  if (shape === null) return [workSegment(meters, unit.paceSeconds)];

  const group = { ...createSegment('REPEAT'), repeatCount: shape.repeats };
  return [
    timeSegment('WARMUP', WARMUP_SECONDS),
    group,
    { ...workSegment(shape.repMeters, unit.paceSeconds), parentKey: group.key },
    { ...timeSegment('RECOVERY', RECOVERY_SECONDS), parentKey: group.key },
    timeSegment('COOLDOWN', COOLDOWN_SECONDS),
  ];
}

/** Plan gotowy do zapisania. Opis nosi powód jednostki, żeby w kalendarzu było wiadomo, po co. */
export function draftFor(unit: PlannedUnit, sport: Sport): EnduranceDraft {
  return {
    sport,
    title: unit.title,
    description: unit.notes ?? '',
    segments: segmentsFor(unit, sport),
  };
}
