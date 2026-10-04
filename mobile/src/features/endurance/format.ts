import type { DurationType, TargetType } from '@/db/schema';

import { formatNumber } from '@/lib/number';

/**
 * Zapis dystansu, czasu i tempa po polsku. Trzymamy to osobno od modelu, bo te same formaty
 * pojawiają się w kreatorze, na treningu, w historii i w podglądzie wysyłki na zegarek.
 */

/** 400 → „400 m”, 5000 → „5 km”, 5500 → „5,5 km”. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${formatNumber(Math.round(meters))} m`;
  // Bez zbędnych zer: 5 km, 5,5 km, 5,25 km.
  const km = Math.round(meters / 10) / 100;
  const decimals = Number.isInteger(km) ? 0 : Number.isInteger(km * 10) ? 1 : 2;
  return `${formatNumber(km, decimals)} km`;
}

/** 90 → „1:30”, 3660 → „1:01:00”. */
export function formatSeconds(total: number): string {
  const seconds = Math.max(0, Math.round(total));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Tempo podajemy w sekundach na kilometr: 300 → „5:00/km”. */
export const formatPace = (secondsPerKm: number): string => `${formatSeconds(secondsPerKm)}/km`;

/** Tempo z pokonanego dystansu i czasu; null, gdy nie ma z czego liczyć. */
export function paceFrom(meters: number | null, seconds: number | null): number | null {
  if (!meters || !seconds || meters <= 0 || seconds <= 0) return null;
  return Math.round(seconds / (meters / 1000));
}

export function describeDuration(
  durationType: DurationType,
  distanceMeters: number | null,
  durationSeconds: number | null,
): string {
  if (durationType === 'DISTANCE') return distanceMeters ? formatDistance(distanceMeters) : 'dystans';
  if (durationType === 'TIME') return durationSeconds ? formatSeconds(durationSeconds) : 'czas';
  return 'do decyzji';
}

export function describeTarget(
  targetType: TargetType,
  low: number | null,
  high: number | null,
): string | null {
  if (targetType === 'NONE' || low === null || high === null) return null;
  if (targetType === 'PACE') {
    // Niższa liczba sekund to szybsze tempo, więc zakres czytamy od szybszego końca.
    return `tempo ${formatPace(low)}–${formatPace(high)}`;
  }
  return `tętno ${Math.round(low)}–${Math.round(high)}`;
}
