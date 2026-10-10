/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import type { GoalWorkoutKind } from '@/db/schema';

import { shiftToDays, type PlannedDay } from '../reschedule';

/** Poniedziałek 2026-10-12 zaczyna tydzień użyty w testach. */
const MONDAY = '2026-10-12';

let next = 1;
const workout = (plannedDate: string, kind: GoalWorkoutKind = 'EASY'): PlannedDay => ({
  id: next++,
  plannedDate,
  kind,
});

/** Dni tygodnia, na które wypadł plan — czytelniej niż porównywanie dat. */
const dayOf = (date: string): string =>
  ['pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd'][
    Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${MONDAY}T00:00:00Z`)) / 86400000) % 7
  ];

function after(workouts: PlannedDay[], weekDays: number[], from: string): string[] {
  const { moves } = shiftToDays(workouts, weekDays, from);
  const moved = new Map(moves.map((move) => [move.id, move.to]));
  return workouts.map((item) => dayOf(moved.get(item.id) ?? item.plannedDate));
}

describe('shiftToDays', () => {
  it('przesuwa cały tydzień z zachowaniem kolejności', () => {
    // Poniedziałek, środa, piątek → wtorek, czwartek, sobota.
    const week = [workout('2026-10-12'), workout('2026-10-14'), workout('2026-10-16', 'LONG')];
    expect(after(week, [1, 3, 5], MONDAY)).toEqual(['wt', 'cz', 'so']);
  });

  it('długa jednostka ląduje na ostatnim wybranym dniu', () => {
    const week = [workout('2026-10-12'), workout('2026-10-17', 'LONG')];
    const [, long] = after(week, [2, 6], MONDAY);
    expect(long).toBe('nd');
  });

  it('te same dni to brak przesunięć', () => {
    const week = [workout('2026-10-13'), workout('2026-10-15')];
    expect(shiftToDays(week, [1, 3], MONDAY).moves).toEqual([]);
  });

  it('rusza wszystkie tygodnie planu, nie tylko pierwszy', () => {
    const plan = [workout('2026-10-12'), workout('2026-10-19'), workout('2026-10-26')];
    const { moves } = shiftToDays(plan, [2], MONDAY);
    expect(moves.map((move) => move.to)).toEqual(['2026-10-14', '2026-10-21', '2026-10-28']);
  });

  it('nie dotyka przeszłości', () => {
    // Czwartek jest „dziś”: poniedziałkowy trening zostaje, piątkowy się przesuwa.
    const week = [workout('2026-10-12'), workout('2026-10-16')];
    const { moves } = shiftToDays(week, [1, 5], '2026-10-15');
    expect(moves).toEqual([{ id: week[1].id, from: '2026-10-16', to: '2026-10-17' }]);
  });

  it('nie przesuwa dnia zawodów', () => {
    // Zawody w sobotę, a sobota nie jest już dniem treningowym — mimo to zostają na swoim dniu.
    const week = [workout('2026-10-12'), workout('2026-10-17', 'RACE')];
    const { moves } = shiftToDays(week, [1, 3], MONDAY);
    expect(moves).toEqual([{ id: week[0].id, from: '2026-10-12', to: '2026-10-15' }]);
  });

  it('rozruch przed startem nie przeskakuje za start', () => {
    // Zawody w środę, a wybrane dni sięgają soboty — rozruch ma zostać przed nimi.
    const week = [workout('2026-10-12'), workout('2026-10-14', 'RACE')];
    const [warmup] = after(week, [1, 3, 5], MONDAY);
    expect(warmup).toBe('wt');
  });

  it('gdy dni jest mniej niż jednostek, najwcześniejsza zostaje na miejscu', () => {
    const week = [workout('2026-10-12'), workout('2026-10-14'), workout('2026-10-16', 'LONG')];
    const shift = shiftToDays(week, [1, 5], MONDAY);
    expect(shift.frozen).toBe(1);
    expect(after(week, [1, 5], MONDAY)).toEqual(['pn', 'wt', 'so']);
  });

  it('jednostka, która zostaje, nie oddaje swojego dnia następnej', () => {
    // Trzy jednostki, dwa dni: wtorkowa zostaje na wtorku, więc ten dzień jest już zajęty
    // i środowa nie ma gdzie wejść — zostaje tam, gdzie była.
    const week = [workout('2026-10-13'), workout('2026-10-14'), workout('2026-10-16')];
    expect(after(week, [1, 3], MONDAY)).toEqual(['wt', 'śr', 'cz']);
    expect(shiftToDays(week, [1, 3], MONDAY).frozen).toBe(2);
  });

  it('żadne dwie jednostki nie lądują na jednym dniu', () => {
    const week = [
      workout('2026-10-12'),
      workout('2026-10-13'),
      workout('2026-10-15'),
      workout('2026-10-17', 'LONG'),
    ];
    const { moves } = shiftToDays(week, [1, 2, 4, 6], MONDAY);
    const dates = week.map(
      (item) => moves.find((move) => move.id === item.id)?.to ?? item.plannedDate,
    );
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('bez wybranych dni nic się nie rusza', () => {
    const week = [workout('2026-10-12')];
    expect(shiftToDays(week, [], MONDAY)).toEqual({ moves: [], frozen: 1 });
  });

  it('dzień wybrany w połowie bieżącego tygodnia, ale już miniony, nie jest celem', () => {
    // „Dziś” to czwartek, a wybrany wtorek w tym tygodniu już był — piątkowa jednostka
    // nie ma się cofać do wtorku.
    const week = [workout('2026-10-16')];
    const { moves, frozen } = shiftToDays(week, [1], '2026-10-15');
    expect(moves).toEqual([]);
    expect(frozen).toBe(1);
  });
});
