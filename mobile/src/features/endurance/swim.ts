import type { Drill, Stroke, SwimEquipment } from '@/db/schema';

/**
 * Rzeczy właściwe wyłącznie pływaniu: długość basenu i styl. Dystans na basenie liczy się
 * w długościach, a nie w metrach — „16 długości” to instrukcja wykonalna przy ścianie,
 * „400 m” trzeba sobie dopiero przeliczyć.
 */

export const POOL_LENGTH_KEY = 'pool_length_m';

/** Baseny, które realnie się spotyka. Inne długości wpisuje się ręcznie. */
export const COMMON_POOL_LENGTHS = [25, 50] as const;

export const DEFAULT_POOL_LENGTH = 25;

export const STROKE_LABELS: Record<Stroke, string> = {
  ANY: 'dowolny',
  FREE: 'kraul',
  BACKSTROKE: 'grzbiet',
  BREASTSTROKE: 'klasyczny',
  FLY: 'motylek',
  MEDLEY: 'zmienny',
  DRILL: 'technika',
};

/**
 * Identyfikatory stylów w Garmin Connect, odczytane z `/workout-service/workout/types`
 * na żywym koncie — nie zgadywane. Wysłanie złego numeru dałoby na zegarku inny styl.
 */
export const GARMIN_STROKES: Record<Stroke, { strokeTypeId: number; strokeTypeKey: string }> = {
  ANY: { strokeTypeId: 1, strokeTypeKey: 'any_stroke' },
  BACKSTROKE: { strokeTypeId: 2, strokeTypeKey: 'backstroke' },
  BREASTSTROKE: { strokeTypeId: 3, strokeTypeKey: 'breaststroke' },
  DRILL: { strokeTypeId: 4, strokeTypeKey: 'drill' },
  FLY: { strokeTypeId: 5, strokeTypeKey: 'fly' },
  FREE: { strokeTypeId: 6, strokeTypeKey: 'free' },
  MEDLEY: { strokeTypeId: 7, strokeTypeKey: 'individual_medley' },
};

/**
 * Dystans wyrażony w długościach basenu. Zwraca null, gdy dystans nie dzieli się równo —
 * „16,4 długości” to liczba, której nikt nie przepłynie, więc lepiej jej nie pokazywać.
 */
export function lengths(meters: number | null, poolLength: number): number | null {
  if (meters === null || meters <= 0 || poolLength <= 0) return null;
  const count = meters / poolLength;
  return Number.isInteger(count) ? count : null;
}

/** „400 m · 16 długości”, a przy niepodzielnym dystansie samo „410 m”. */
export function describeSwimDistance(
  meters: number | null,
  poolLength: number,
  formatDistance: (meters: number) => string,
): string | null {
  if (meters === null || meters <= 0) return null;
  const count = lengths(meters, poolLength);
  return count === null ? formatDistance(meters) : `${formatDistance(meters)} · ${count}×`;
}

export const EQUIPMENT_LABELS: Record<SwimEquipment, string> = {
  FINS: 'płetwy',
  KICKBOARD: 'deska',
  PADDLES: 'wiosełka',
  PULL_BUOY: 'ósemka',
  SNORKEL: 'fajka',
};

export const DRILL_LABELS: Record<Drill, string> = {
  KICK: 'same nogi',
  PULL: 'same ręce',
  DRILL: 'ćwiczenie techniczne',
};

/** Identyfikatory sprzętu, odczytane z `/workout-service/workout/types` na żywym koncie. */
export const GARMIN_EQUIPMENT: Record<SwimEquipment, { equipmentTypeId: number; equipmentTypeKey: string }> = {
  FINS: { equipmentTypeId: 1, equipmentTypeKey: 'fins' },
  KICKBOARD: { equipmentTypeId: 2, equipmentTypeKey: 'kickboard' },
  PADDLES: { equipmentTypeId: 3, equipmentTypeKey: 'paddles' },
  PULL_BUOY: { equipmentTypeId: 4, equipmentTypeKey: 'pull_buoy' },
  SNORKEL: { equipmentTypeId: 5, equipmentTypeKey: 'snorkel' },
};

/** Identyfikatory ćwiczeń technicznych, z tego samego słownika. */
export const GARMIN_DRILLS: Record<Drill, { drillTypeId: number; drillTypeKey: string }> = {
  KICK: { drillTypeId: 1, drillTypeKey: 'kick' },
  PULL: { drillTypeId: 2, drillTypeKey: 'pull' },
  DRILL: { drillTypeId: 3, drillTypeKey: 'drill' },
};
