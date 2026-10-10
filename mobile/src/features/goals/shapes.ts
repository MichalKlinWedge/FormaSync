import type { GoalPhase, GoalWorkoutKind, Sport } from '@/db/schema';
import { formatDistance } from '@/features/endurance/format';

/**
 * Kształt jednostki: ile powtórzeń, jak długich, i jak to nazwać. Liczymy go z samego dystansu,
 * więc ta sama funkcja daje tytuł na liście i odcinki przy wpisywaniu do kalendarza — plan nie
 * może obiecywać „6 × 800 m”, a wysłać na zegarek czegoś innego.
 */

/** Długość odcinka interwałowego. Pływak liczy setki, rowerzysta kilometry. */
const REP_METERS: Partial<Record<Sport, number>> = {
  RUNNING: 800,
  CYCLING: 3000,
  SWIMMING: 100,
};

/** Rozgrzewka i schłodzenie przy jednostkach z intensywnością. */
export const WARMUP_SECONDS = 600;
export const COOLDOWN_SECONDS = 600;

/** Przerwa między odcinkami: tyle, żeby zdążyć wrócić do oddechu, a nie wystygnąć. */
export const RECOVERY_SECONDS = 90;

export const PHASE_LABELS: Record<GoalPhase, string> = {
  BASE: 'Baza',
  BUILD: 'Budowanie',
  PEAK: 'Szczyt',
  TAPER: 'Roztrenowanie',
  RACE: 'Start',
};

export const KIND_LABELS: Record<GoalWorkoutKind, string> = {
  EASY: 'Spokojny',
  LONG: 'Długi',
  TEMPO: 'Tempo',
  INTERVALS: 'Interwały',
  RACE: 'Zawody',
};

export type IntervalShape = { repeats: number; repMeters: number };

/**
 * Podział jednostki interwałowej na powtórzenia. Na odcinki idzie nieco ponad połowa dystansu —
 * resztę zjada rozgrzewka i schłodzenie, bez których interwałów się nie robi. Liczba powtórzeń
 * jest ograniczona z dwóch stron: trzy odcinki nie są treningiem, a dwunastu nikt nie dowiezie.
 */
export function intervalShape(sport: Sport, distanceMeters: number): IntervalShape | null {
  const repMeters = REP_METERS[sport];
  if (repMeters === undefined || distanceMeters <= 0) return null;
  const repeats = Math.min(10, Math.max(4, Math.round((distanceMeters * 0.55) / repMeters)));
  return { repeats, repMeters };
}

/** Nazwa jednostki — ta sama, która trafi do kalendarza i na zegarek. */
export function workoutTitle(
  kind: GoalWorkoutKind,
  sport: Sport,
  distanceMeters: number,
  goalTitle: string,
): string {
  if (kind === 'RACE') return `Zawody: ${goalTitle}`;
  if (kind === 'INTERVALS') {
    const shape = intervalShape(sport, distanceMeters);
    if (shape !== null) {
      return `Interwały ${shape.repeats} × ${formatDistance(shape.repMeters)}`;
    }
  }
  return `${KIND_LABELS[kind]} ${formatDistance(distanceMeters)}`;
}

/** Zdanie wyjaśniające, po co ta jednostka. Plan bez tego jest listą liczb. */
export const KIND_NOTES: Record<GoalWorkoutKind, string> = {
  EASY: 'Objętość bez zmęczenia — tempo na swobodną rozmowę.',
  LONG: 'Najdłuższa jednostka tygodnia. Tempo spokojne, chodzi o czas na nogach.',
  TEMPO: 'Ciągły wysiłek w tempie bliskim startowemu, po rozgrzewce.',
  INTERVALS: 'Odcinki szybciej od tempa startowego, z truchtem między nimi.',
  RACE: 'Dzień startu.',
};
