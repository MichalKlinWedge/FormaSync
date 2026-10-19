import { startOfWeek, weeksBetween } from '@/lib/date';

/**
 * Plan w tygodniach kalendarza.
 *
 * Numer tygodnia liczymy tu, z dat, a nie z zapisanego przy jednostce `weekIndex`. Powód jest
 * praktyczny: przy korekcie w trakcie cyklu nowe jednostki przychodzą ponumerowane od bieżącego
 * tygodnia, a jednostki z przeszłości zostają ze swoimi numerami z pierwszego układania. Oba
 * zestawy wpadały wtedy do jednego worka — ósmy tydzień planu wyświetlał się jako pierwszy, obok
 * prawdziwego pierwszego ze września.
 *
 * Data jest jedyną rzeczą, która po korekcie nadal znaczy to samo, więc numerujemy po niej.
 * Tydzień bez ani jednej jednostki zostawia dziurę w numeracji — i słusznie, bo tydzień przerwy
 * jest częścią planu, a zwarta numeracja udawałaby ciągłość, której nie było.
 */
export type PlanWeek<T> = {
  /** Poniedziałek tego tygodnia. */
  startDate: string;
  /** Numer tygodnia planu, od jedynki. */
  number: number;
  workouts: T[];
};

export function planWeeks<T extends { plannedDate: string }>(
  workouts: readonly T[],
): PlanWeek<T>[] {
  const byWeek = new Map<string, T[]>();
  for (const workout of workouts) {
    const monday = startOfWeek(workout.plannedDate);
    const bucket = byWeek.get(monday);
    if (bucket === undefined) byWeek.set(monday, [workout]);
    else bucket.push(workout);
  }

  const mondays = [...byWeek.keys()].sort();
  const first = mondays[0];
  return mondays.map((monday) => ({
    startDate: monday,
    number: weeksBetween(first, monday) + 1,
    workouts: byWeek.get(monday) ?? [],
  }));
}
