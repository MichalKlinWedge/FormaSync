import type { GoalWorkoutKind } from '@/db/schema';

/**
 * Tempa jednostek wyrażamy jako krotność tempa docelowego, a nie jako przesunięcia w sekundach
 * na kilometr. Sekundy trzeba by dobierać osobno dla biegania, roweru i pływania — a i w obrębie
 * biegania inaczej dla kogoś na 4:00/km, inaczej na 7:00/km. Krotność działa wszędzie tak samo:
 * spokojny bieg to zawsze jakieś dwadzieścia procent wolniej od tempa startowego.
 *
 * Liczby to reguły orientacyjne z praktyki treningowej, nie wyrocznia.
 */
export const PACE_FACTORS: Record<GoalWorkoutKind, number> = {
  EASY: 1.22,
  LONG: 1.15,
  TEMPO: 1.02,
  INTERVALS: 0.92,
  RACE: 1,
};

/**
 * Tempo startowe. Czas docelowy mówi je wprost; bez niego bierzemy najlepsze tempo z historii —
 * to przybliżenie w górę, bo rekord na krótszym dystansie jest szybszy niż tempo zawodów, ale
 * lepsze niż brak jakiejkolwiek wskazówki.
 */
export function racePace(
  distanceMeters: number,
  targetSeconds: number | null,
  bestPaceSeconds: number | null,
): number | null {
  if (targetSeconds !== null && targetSeconds > 0 && distanceMeters > 0) {
    return Math.round(targetSeconds / (distanceMeters / 1000));
  }
  return bestPaceSeconds !== null && bestPaceSeconds > 0 ? bestPaceSeconds : null;
}

/** Tempo jednostki; null, gdy nie znamy tempa startowego. */
export function paceFor(kind: GoalWorkoutKind, racePaceSeconds: number | null): number | null {
  if (racePaceSeconds === null) return null;
  return Math.round(racePaceSeconds * PACE_FACTORS[kind]);
}

/** Widełki tempa dla zegarka: pięć procent w każdą stronę, żeby nie gonić jednej sekundy. */
export function paceRange(paceSeconds: number): { low: number; high: number } {
  return { low: Math.round(paceSeconds * 0.95), high: Math.round(paceSeconds * 1.05) };
}

/** Czas trwania jednostki z dystansu i tempa; null, gdy brakuje któregokolwiek. */
export function durationFrom(distanceMeters: number | null, paceSeconds: number | null): number | null {
  if (distanceMeters === null || paceSeconds === null || distanceMeters <= 0) return null;
  return Math.round((distanceMeters / 1000) * paceSeconds);
}
