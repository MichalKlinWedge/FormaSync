/**
 * Rozbicie wyniku pobrania na poszczególne pomiary. Puste miejsce w dniu ma dwie różne przyczyny
 * — nie było czego zmierzyć albo odczyt nie zadziałał — a Garmin nie dokumentuje tego API, więc
 * drugiej nie wolno przegapić.
 */
export const METRIC_LABELS = {
  restingHeartRate: 'Tętno spoczynkowe',
  sleep: 'Sen',
  hrv: 'HRV',
  pressure: 'Ciśnienie',
  calories: 'Kalorie',
} as const;

export type MetricName = keyof typeof METRIC_LABELS;

/** Rozpisuje wynik pobrania po pomiarach, żeby „0 z 7” rzucało się w oczy. */
export function describeCounts(counts: Record<MetricName, number>, days: number): string {
  const names = Object.keys(METRIC_LABELS) as MetricName[];
  return names.map((name) => `${METRIC_LABELS[name]}: ${counts[name]} z ${days} dni.`).join('\n');
}
