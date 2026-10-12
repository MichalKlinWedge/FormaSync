/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { bodyMeasurements as measurements } from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { finishSession, startSession } from '@/features/workout/repository';

import { mealByHour } from '../meal';
import {
  dayMeals,
  dayTotals,
  dayTotalsRange,
  logMeal,
  MealError,
  recentMeals,
  removeMeal,
  trainingKcalOn,
  trainingKcalRange,
  weightPointsSince,
} from '../repository';

/** Lokalna pora dnia — klucz dnia liczymy w strefie telefonu, więc testy też. */
const at = (hour: number, minute = 0) => new Date(2026, 9, 11, hour, minute);

const breakfast = { meal: 'BREAKFAST' as const, title: 'Owsianka', kcal: 420, proteinG: 18 };

describe('logMeal', () => {
  it('zapisuje posiłek w dniu lokalnym', () => {
    const db = createTestDb();
    logMeal(db, breakfast, at(8, 30));

    const meals = dayMeals(db, '2026-10-11');
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ meal: 'BREAKFAST', title: 'Owsianka', kcal: 420, proteinG: 18 });
  });

  it('kolacja przed północą zostaje w swoim dniu', () => {
    const db = createTestDb();
    logMeal(db, { ...breakfast, meal: 'DINNER', title: 'Kanapki' }, at(23, 30));
    expect(dayMeals(db, '2026-10-11')).toHaveLength(1);
    expect(dayMeals(db, '2026-10-12')).toHaveLength(0);
  });

  it('nie przyjmuje wpisu bez nazwy ani bez kalorii', () => {
    const db = createTestDb();
    expect(() => logMeal(db, { ...breakfast, title: '   ' })).toThrow(MealError);
    expect(() => logMeal(db, { ...breakfast, kcal: 0 })).toThrow(MealError);
  });

  it('zera w makroskładnikach zapisuje jako brak, nie jako zero', () => {
    const db = createTestDb();
    logMeal(db, { meal: 'SNACK', title: 'Herbata', kcal: 5, proteinG: 0, carbsG: 0 }, at(16));
    expect(dayMeals(db, '2026-10-11')[0]).toMatchObject({ proteinG: null, carbsG: null });
  });
});

describe('dayTotals', () => {
  it('sumuje kalorie i makroskładniki dnia', () => {
    const db = createTestDb();
    logMeal(db, breakfast, at(8));
    logMeal(db, { meal: 'LUNCH', title: 'Kurczak z ryżem', kcal: 780, proteinG: 55, carbsG: 90 }, at(13));

    expect(dayTotals(db, '2026-10-11')).toEqual({
      kcal: 1200,
      proteinG: 73,
      carbsG: 90,
      fatG: 0,
      meals: 2,
    });
  });

  it('dzień bez wpisów to zera, nie brak danych', () => {
    expect(dayTotals(createTestDb(), '2026-10-11')).toMatchObject({ kcal: 0, meals: 0 });
  });

  it('usunięty wpis nie liczy się już do dnia', () => {
    const db = createTestDb();
    const id = logMeal(db, breakfast, at(8));
    removeMeal(db, id);
    expect(dayTotals(db, '2026-10-11').kcal).toBe(0);
  });
});

describe('recentMeals', () => {
  it('podaje ostatnio jedzone bez powtórzeń nazwy', () => {
    const db = createTestDb();
    logMeal(db, breakfast, at(8));
    logMeal(db, { meal: 'LUNCH', title: 'Kurczak', kcal: 700 }, at(13));
    // Ta sama owsianka następnego dnia: na liście ma zostać jedna, ta nowsza.
    logMeal(db, { ...breakfast, kcal: 450 }, new Date(2026, 9, 12, 8));

    const recent = recentMeals(db);
    expect(recent.map((entry) => entry.title)).toEqual(['Owsianka', 'Kurczak']);
    expect(recent[0].kcal).toBe(450);
  });

  it('nazwy porównuje bez wielkości liter i polskich znaków', () => {
    const db = createTestDb();
    logMeal(db, { meal: 'LUNCH', title: 'Jajecznica', kcal: 300 }, at(9));
    logMeal(db, { meal: 'LUNCH', title: 'JAJECZNICA', kcal: 320 }, at(10));
    expect(recentMeals(db)).toHaveLength(1);
  });
});

describe('dayTotalsRange', () => {
  it('sumuje dni zakresu i pomija te bez wpisów', () => {
    const db = createTestDb();
    logMeal(db, breakfast, new Date(2026, 9, 9, 8));
    logMeal(db, { ...breakfast, title: 'Kanapka', kcal: 300 }, new Date(2026, 9, 9, 13));
    logMeal(db, breakfast, new Date(2026, 9, 11, 8));

    const rows = dayTotalsRange(db, '2026-10-08', '2026-10-12');
    expect(rows).toEqual([
      { dayKey: '2026-10-09', kcal: 720, proteinG: 36, meals: 2 },
      { dayKey: '2026-10-11', kcal: 420, proteinG: 18, meals: 1 },
    ]);
  });

  it('nie wychodzi poza zakres', () => {
    const db = createTestDb();
    logMeal(db, breakfast, new Date(2026, 9, 1, 8));
    logMeal(db, breakfast, new Date(2026, 9, 11, 8));
    expect(dayTotalsRange(db, '2026-10-10', '2026-10-12').map((row) => row.dayKey)).toEqual([
      '2026-10-11',
    ]);
  });
});

describe('trainingKcalRange', () => {
  it('rozkłada kalorie treningów na dni', () => {
    const db = createTestDb({ seed: true });
    const older = startSession(
      db,
      { kind: 'empty', sport: 'RUNNING' },
      new Date(2026, 9, 9, 17).toISOString(),
    );
    finishSession(db, older, {}, new Date(2026, 9, 9, 18).toISOString());
    const today = startSession(db, { kind: 'empty', sport: 'RUNNING' }, at(17).toISOString());
    finishSession(db, today, {}, at(18).toISOString());

    expect(trainingKcalRange(db, '2026-10-09', '2026-10-11', 85)).toEqual({
      '2026-10-09': 875,
      '2026-10-11': 875,
    });
    // Jeden dzień z tego samego rachunku — ekran dnia pyta właśnie tak.
    expect(trainingKcalOn(db, '2026-10-09', 85)).toBe(875);
  });
});

describe('weightPointsSince', () => {
  it('bierze pomiary z masą, od najstarszego', () => {
    const db = createTestDb();
    db.insert(measurements).values({ measuredOn: '2026-10-01', weightKg: 85.4 }).run();
    db.insert(measurements).values({ measuredOn: '2026-10-08', weightKg: 84.9 }).run();
    // Pomiar bez masy (sam obwód) nie jest punktem trendu.
    db.insert(measurements).values({ measuredOn: '2026-10-10', waistCm: 92 }).run();
    db.insert(measurements).values({ measuredOn: '2026-09-01', weightKg: 90 }).run();

    expect(weightPointsSince(db, '2026-10-01')).toEqual([
      { dayKey: '2026-10-01', weightKg: 85.4 },
      { dayKey: '2026-10-08', weightKg: 84.9 },
    ]);
  });
});

describe('trainingKcalOn', () => {
  it('liczy kalorie z dzisiejszych zakończonych treningów', () => {
    const db = createTestDb({ seed: true });
    const session = startSession(db, { kind: 'empty', sport: 'RUNNING' }, at(17).toISOString());
    finishSession(db, session, {}, at(18).toISOString());

    // Godzina biegu przy 85 kg to około 875 kcal; liczy je `trainingBurn`.
    expect(trainingKcalOn(db, '2026-10-11', 85)).toBe(875);
    expect(trainingKcalOn(db, '2026-10-10', 85)).toBe(0);
  });

  it('bez masy ciała nie wymyśla liczby', () => {
    const db = createTestDb({ seed: true });
    const session = startSession(db, { kind: 'empty', sport: 'RUNNING' }, at(17).toISOString());
    finishSession(db, session, {}, at(18).toISOString());
    expect(trainingKcalOn(db, '2026-10-11', null)).toBe(0);
  });

  it('trwający trening nie liczy się, dopóki się nie skończy', () => {
    const db = createTestDb({ seed: true });
    startSession(db, { kind: 'empty', sport: 'RUNNING' }, at(17).toISOString());
    expect(trainingKcalOn(db, '2026-10-11', 85)).toBe(0);
  });
});

describe('mealByHour', () => {
  it('podsuwa posiłek po godzinie', () => {
    expect(mealByHour(at(7))).toBe('BREAKFAST');
    expect(mealByHour(at(13))).toBe('LUNCH');
    expect(mealByHour(at(19))).toBe('DINNER');
    expect(mealByHour(at(23))).toBe('SNACK');
  });
});
