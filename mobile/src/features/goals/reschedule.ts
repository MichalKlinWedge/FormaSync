import type { GoalWorkoutKind } from '@/db/schema';
import { addDays, startOfWeek } from '@/lib/date';

/**
 * Przesunięcie gotowego planu na inne dni tygodnia.
 *
 * Pomyłka przy wyborze dni wychodzi dopiero wtedy, gdy rozpiska już stoi — a przeliczenie planu
 * od nowa jest na to młotem: zmienia objętości, rodzaje jednostek i wszystko, co zdążyłeś
 * obejrzeć. Tutaj zostaje układ planu, zmieniają się same daty.
 *
 * Reguły, które z tego wynikają:
 * — przeszłość zostaje nietknięta; trening, który się odbył albo przepadł, to już nie plan,
 * — dzień zawodów nie jest dniem treningowym i nie przesuwa się nigdy,
 * — kolejność w tygodniu zostaje zachowana, licząc od końca: jednostka, która była ostatnia,
 *   ląduje na ostatnim wybranym dniu. Długie wybiegania zostają więc tam, gdzie był na nie czas,
 * — jednostka, dla której w tygodniu zabrakło dnia, zostaje na swoim miejscu, zamiast wchodzić
 *   na cudzy dzień. Lepiej zostawić ślad pomyłki widoczny, niż zlać dwa treningi w jeden.
 */

export type PlannedDay = {
  id: number;
  plannedDate: string;
  kind: GoalWorkoutKind;
};

export type DayMove = { id: number; from: string; to: string };

export type DayShift = {
  moves: DayMove[];
  /** Jednostki z przyszłości, które zostają tam, gdzie były — zabrakło dla nich dnia. */
  frozen: number;
};

/**
 * Łączy jednostki z wolnymi dniami w jednym kawałku tygodnia. Zwraca, ile zostało na miejscu.
 * Parujemy od końca, a zostają te najwcześniejsze: tydzień kończy się długą jednostką i to ona
 * ma trafić na dzień, na którym Ci zależy.
 */
function pair(movers: PlannedDay[], open: string[], moves: DayMove[]): number {
  const queue = [...movers];
  let free = [...open];
  let stayed = 0;

  while (queue.length > free.length && queue.length > 0) {
    const staying = queue.shift() as PlannedDay;
    stayed += 1;
    // Dzień, na którym została, przestaje być wolny — inaczej wskoczyłaby na nią następna.
    free = free.filter((date) => date !== staying.plannedDate);
  }

  const chosen = free.slice(free.length - queue.length);
  queue.forEach((workout, index) => {
    if (chosen[index] !== workout.plannedDate) {
      moves.push({ id: workout.id, from: workout.plannedDate, to: chosen[index] });
    }
  });
  return stayed;
}

/** Daty, które się nie ruszają: zawody i wszystko, co już minęło. */
const anchored = (workout: PlannedDay, from: string): boolean =>
  workout.kind === 'RACE' || workout.plannedDate < from;

export function shiftToDays(workouts: PlannedDay[], weekDays: number[], from: string): DayShift {
  const days = [...new Set(weekDays)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);

  const movable = workouts.filter((workout) => !anchored(workout, from));
  if (days.length === 0) return { moves: [], frozen: movable.length };

  const anchors = workouts.filter((workout) => anchored(workout, from)).map((w) => w.plannedDate);
  const moves: DayMove[] = [];
  let frozen = 0;

  for (const weekStart of [...new Set(movable.map((w) => startOfWeek(w.plannedDate)))].sort()) {
    const inWeek = movable
      .filter((workout) => startOfWeek(workout.plannedDate) === weekStart)
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    const bounds = anchors.filter((date) => startOfWeek(date) === weekStart);
    const slots = days
      .map((day) => addDays(weekStart, day))
      .filter((date) => date >= from && !bounds.includes(date));

    // Dzień zawodów dzieli tydzień: rozruch sprzed startu nie ma prawa wylądować po nim.
    const part = (date: string): number => bounds.filter((bound) => bound < date).length;
    for (let index = 0; index <= bounds.length; index += 1) {
      frozen += pair(
        inWeek.filter((workout) => part(workout.plannedDate) === index),
        slots.filter((date) => part(date) === index),
        moves,
      );
    }
  }

  return { moves, frozen };
}
