/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import type { GoalWorkoutKind } from '@/db/schema';

import { planDays, shiftByDays, type PlannedDay } from '../reschedule';

/** Poniedziałek 2026-10-12 zaczyna tydzień użyty w testach. */
const MONDAY = '2026-10-12';

let next = 1;
const workout = (plannedDate: string, kind: GoalWorkoutKind = 'EASY'): PlannedDay => ({
  id: next++,
  plannedDate,
  kind,
});

/** Dni tygodnia, na które wypadł plan po przesunięciu — czytelniej niż porównywanie dat. */
function after(workouts: PlannedDay[], map: Record<number, number>, from: string): string[] {
  const { moves } = shiftByDays(workouts, map, from);
  const moved = new Map(moves.map((move) => [move.id, move.to]));
  return workouts.map((item) => {
    const date = moved.get(item.id) ?? item.plannedDate;
    const index = Math.round(
      (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${MONDAY}T00:00:00Z`)) / 86400000,
    );
    return ['pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd'][index % 7];
  });
}

describe('planDays', () => {
  it('mówi, na jakich dniach stoi plan', () => {
    // Wtorek, czwartek, sobota — stan, od którego zaczyna się poprawianie pomyłki.
    const plan = [workout('2026-10-13'), workout('2026-10-15'), workout('2026-10-17', 'LONG')];
    expect(planDays(plan, MONDAY)).toEqual([1, 3, 5]);
  });

  it('nie liczy przeszłości ani dnia zawodów', () => {
    const plan = [workout('2026-10-12'), workout('2026-10-18', 'RACE'), workout('2026-10-16')];
    expect(planDays(plan, '2026-10-14')).toEqual([4]);
  });
});

describe('shiftByDays', () => {
  it('przesuwa każdy dzień tam, gdzie wskazano', () => {
    // Wtorek, czwartek, sobota → poniedziałek, środa, niedziela.
    const week = [workout('2026-10-13'), workout('2026-10-15'), workout('2026-10-17', 'LONG')];
    expect(after(week, { 1: 0, 3: 2, 5: 6 }, MONDAY)).toEqual(['pn', 'śr', 'nd']);
  });

  it('rusza wszystkie tygodnie planu, nie tylko pierwszy', () => {
    const plan = [workout('2026-10-13'), workout('2026-10-20'), workout('2026-10-27')];
    const { moves } = shiftByDays(plan, { 1: 2 }, MONDAY);
    expect(moves.map((move) => move.to)).toEqual(['2026-10-14', '2026-10-21', '2026-10-28']);
  });

  it('zamienia dwa dni miejscami', () => {
    const week = [workout('2026-10-13'), workout('2026-10-15')];
    expect(after(week, { 1: 3, 3: 1 }, MONDAY)).toEqual(['cz', 'wt']);
  });

  it('dzień wskazany na siebie samego zostaje bez ruchu', () => {
    const week = [workout('2026-10-13'), workout('2026-10-15')];
    expect(shiftByDays(week, { 1: 1, 3: 2 }, MONDAY).moves).toHaveLength(1);
  });

  it('nie dotyka przeszłości', () => {
    // Czwartek jest „dziś”: wtorkowy trening zostaje, sobotni się przesuwa.
    const week = [workout('2026-10-13'), workout('2026-10-17')];
    const { moves } = shiftByDays(week, { 1: 0, 5: 6 }, '2026-10-15');
    expect(moves).toEqual([{ id: week[1].id, from: '2026-10-17', to: '2026-10-18' }]);
  });

  it('nie przesuwa dnia zawodów', () => {
    const week = [workout('2026-10-13'), workout('2026-10-17', 'RACE')];
    const { moves } = shiftByDays(week, { 1: 3, 5: 2 }, MONDAY);
    expect(moves).toEqual([{ id: week[0].id, from: '2026-10-13', to: '2026-10-15' }]);
  });

  it('nie wchodzi na dzień zawodów', () => {
    const week = [workout('2026-10-13'), workout('2026-10-17', 'RACE')];
    const shift = shiftByDays(week, { 1: 5 }, MONDAY);
    expect(shift.moves).toEqual([]);
    expect(shift.frozen).toBe(1);
  });

  it('nie wchodzi na jednostkę, która zostaje', () => {
    // Wtorek ma iść na środę, ale środowa jednostka nie rusza się nigdzie.
    const week = [workout('2026-10-13'), workout('2026-10-14')];
    const shift = shiftByDays(week, { 1: 2 }, MONDAY);
    expect(shift.moves).toEqual([]);
    expect(shift.frozen).toBe(1);
  });

  it('dzień docelowy, który w tym tygodniu już minął, nie jest celem', () => {
    // „Dziś” to czwartek, a sobotnia jednostka miałaby iść na wtorek — w tym tygodniu po terminie.
    const week = [workout('2026-10-17')];
    const shift = shiftByDays(week, { 5: 1 }, '2026-10-15');
    expect(shift).toEqual({ moves: [], frozen: 1 });
  });

  it('żadne dwie jednostki nie lądują na jednym dniu', () => {
    const plan = [
      workout('2026-10-13'),
      workout('2026-10-15'),
      workout('2026-10-17'),
      workout('2026-10-20'),
      workout('2026-10-22'),
      workout('2026-10-24'),
    ];
    const { moves } = shiftByDays(plan, { 1: 0, 3: 2, 5: 6 }, MONDAY);
    const dates = plan.map(
      (item) => moves.find((move) => move.id === item.id)?.to ?? item.plannedDate,
    );
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('dzień spoza przesunięcia zostaje tam, gdzie był', () => {
    const week = [workout('2026-10-13'), workout('2026-10-16')];
    const { moves } = shiftByDays(week, { 1: 0 }, MONDAY);
    expect(moves.map((move) => move.id)).toEqual([week[0].id]);
  });
});
