import type { GoalWorkoutKind } from '@/db/schema';
import { addDays, startOfWeek, weekdayIndex } from '@/lib/date';

/**
 * Przesunięcie gotowego planu na inne dni tygodnia.
 *
 * Pomyłka przy wyborze dni wychodzi dopiero wtedy, gdy rozpiska już stoi — a przeliczenie planu
 * od nowa jest na to młotem: zmienia objętości, rodzaje jednostek i wszystko, co zdążyłeś
 * obejrzeć. Tutaj zostaje układ planu, zmieniają się same daty.
 *
 * Przesunięcie opisujemy wprost: z którego dnia na który. Zbiór dni sam w sobie by nie wystarczył
 * — przy trzech jednostkach i trzech dniach trzeba jeszcze wiedzieć, która gdzie idzie, a każda
 * reguła zgadywania tego za użytkownika jest regułą, której nie widać na ekranie.
 *
 * Reguły, które zostają:
 * — przeszłość zostaje nietknięta; trening, który się odbył albo przepadł, to już nie plan,
 * — dzień zawodów nie jest dniem treningowym i nie przesuwa się nigdy,
 * — jednostka, dla której dzień docelowy jest zajęty albo już minął, zostaje na swoim miejscu.
 *   Widoczny ślad pomyłki jest lepszy niż dwa treningi zlane w jeden.
 */

export type PlannedDay = {
  id: number;
  plannedDate: string;
  kind: GoalWorkoutKind;
};

export type DayMove = { id: number; from: string; to: string };

export type DayShift = {
  moves: DayMove[];
  /** Jednostki z przyszłości, które zostają tam, gdzie były — dzień docelowy był zajęty. */
  frozen: number;
};

/** Przesunięcie: z dnia tygodnia na dzień tygodnia, 0 = poniedziałek. */
export type DayMap = Record<number, number>;

/** Daty, które się nie ruszają: zawody i wszystko, co już minęło. */
const anchored = (workout: PlannedDay, from: string): boolean =>
  workout.kind === 'RACE' || workout.plannedDate < from;

/**
 * Dni tygodnia, na których stoi plan — licząc tylko to, co jeszcze przed Tobą. To od nich zaczyna
 * się przesunięcie: ekran ma pokazać stan faktyczny planu, a nie dni zapisane kiedyś przy celu.
 */
export function planDays(workouts: PlannedDay[], from: string): number[] {
  return [
    ...new Set(
      workouts
        .filter((workout) => !anchored(workout, from))
        .map((workout) => weekdayIndex(workout.plannedDate)),
    ),
  ].sort((a, b) => a - b);
}

export function shiftByDays(workouts: PlannedDay[], map: DayMap, from: string): DayShift {
  const movable = workouts
    .filter((workout) => !anchored(workout, from))
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));

  // Dni zajęte przez to, co się nie rusza. Jednostka nie ma prawa wejść na zawody ani na kolegę.
  const taken = new Set(
    workouts.filter((workout) => anchored(workout, from)).map((workout) => workout.plannedDate),
  );

  const wanted = movable.map((workout) => {
    const target = map[weekdayIndex(workout.plannedDate)];
    if (target === undefined) return workout.plannedDate;
    return addDays(startOfWeek(workout.plannedDate), target);
  });

  // Najpierw dni tych, które zostają: inaczej następna jednostka weszłaby na zajęte miejsce.
  movable.forEach((workout, index) => {
    if (wanted[index] === workout.plannedDate || wanted[index] < from) taken.add(workout.plannedDate);
  });

  const moves: DayMove[] = [];
  let frozen = 0;

  movable.forEach((workout, index) => {
    const to = wanted[index];
    if (to === workout.plannedDate) return;
    // Dzień docelowy w tym tygodniu już minął albo jest zajęty — zostawiamy jednostkę na miejscu.
    if (to < from || taken.has(to)) {
      frozen += 1;
      taken.add(workout.plannedDate);
      return;
    }
    taken.add(to);
    moves.push({ id: workout.id, from: workout.plannedDate, to });
  });

  return { moves, frozen };
}
