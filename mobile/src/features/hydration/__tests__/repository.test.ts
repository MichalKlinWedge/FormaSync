/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { saveMeasurement } from '@/features/progress/repository';

import {
  addExtra,
  consumedOn,
  dailySummaries,
  dayPortions,
  extraOn,
  latestWeightKg,
  logDrink,
  removeDrink,
  trainingSecondsOn,
  undoLastDrink,
} from '../repository';

const TODAY = '2026-10-10';
/** Godziny w strefie telefonu: klucz dnia jest pojęciem lokalnym, nie uniwersalnym. */
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 9, day, hours, minutes);

const emptyMeasurement = {
  bodyFatPercent: null,
  chestCm: null,
  waistCm: null,
  hipsCm: null,
  armCm: null,
  thighCm: null,
  systolic: null,
  diastolic: null,
  notes: null,
};

/** Zakończony trening o zadanym czasie trwania, wpisany wprost — hydratacja nie zna sesji. */
function training(db: ReturnType<typeof createTestDb>, start: Date, seconds: number) {
  db.insert(schema.workoutSessions)
    .values({
      sport: 'RUNNING',
      status: 'COMPLETED',
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + seconds * 1000).toISOString(),
      totalDurationSeconds: seconds,
    })
    .run();
}

describe('zapis porcji', () => {
  it('zapisuje porcję z dniem liczonym lokalnie', () => {
    const db = createTestDb({ seed: true });
    logDrink(db, 250, at(10, 9));

    const [portion] = dayPortions(db, TODAY);
    expect(portion).toMatchObject({ milliliters: 250, source: 'APP' });
    expect(consumedOn(db, TODAY)).toBe(250);
  });

  it('sumuje porcje dnia i nie miesza ich z innym dniem', () => {
    const db = createTestDb({ seed: true });
    logDrink(db, 250, at(10, 9));
    logDrink(db, 500, at(10, 13));
    logDrink(db, 750, at(11, 9));

    expect(consumedOn(db, TODAY)).toBe(750);
    expect(consumedOn(db, '2026-10-11')).toBe(750);
  });

  it('porcje wracają w kolejności picia', () => {
    const db = createTestDb({ seed: true });
    logDrink(db, 500, at(10, 13));
    logDrink(db, 250, at(10, 9));

    expect(dayPortions(db, TODAY).map((portion) => portion.milliliters)).toEqual([250, 500]);
  });

  it('nie przyjmuje porcji zerowej ani ujemnej', () => {
    const db = createTestDb({ seed: true });
    expect(() => logDrink(db, 0, at(10, 9))).toThrow();
    expect(() => logDrink(db, -250, at(10, 9))).toThrow();
  });

  it('cofa ostatnią porcję dnia', () => {
    const db = createTestDb({ seed: true });
    logDrink(db, 250, at(10, 9));
    logDrink(db, 500, at(10, 13));

    expect(undoLastDrink(db, TODAY)).toBe(true);
    expect(consumedOn(db, TODAY)).toBe(250);
  });

  it('bez porcji nie ma czego cofać', () => {
    const db = createTestDb({ seed: true });
    expect(undoLastDrink(db, TODAY)).toBe(false);
  });

  it('usuwa wskazaną porcję z osi czasu', () => {
    const db = createTestDb({ seed: true });
    const id = logDrink(db, 250, at(10, 9));
    logDrink(db, 500, at(10, 13));
    removeDrink(db, id);

    expect(dayPortions(db, TODAY).map((portion) => portion.milliliters)).toEqual([500]);
  });
});

describe('masa ciała', () => {
  it('bierze masę z najnowszego pomiaru', () => {
    const db = createTestDb({ seed: true });
    saveMeasurement(db, { ...emptyMeasurement, measuredOn: '2026-10-01', weightKg: 82 });
    saveMeasurement(db, { ...emptyMeasurement, measuredOn: '2026-10-08', weightKg: 80.5 });

    expect(latestWeightKg(db)).toBe(80.5);
  });

  it('pomija pomiary wpisane bez masy', () => {
    const db = createTestDb({ seed: true });
    saveMeasurement(db, { ...emptyMeasurement, measuredOn: '2026-10-01', weightKg: 82 });
    saveMeasurement(db, { ...emptyMeasurement, measuredOn: '2026-10-08', waistCm: 90, weightKg: null });

    expect(latestWeightKg(db)).toBe(82);
  });

  it('bez pomiarów nie zgaduje masy', () => {
    expect(latestWeightKg(createTestDb({ seed: true }))).toBeNull();
  });
});

describe('korekta dnia', () => {
  it('dokłada i czyści korektę', () => {
    const db = createTestDb({ seed: true });
    expect(extraOn(db, TODAY)).toBe(0);
    expect(addExtra(db, TODAY, 250)).toBe(250);
    expect(addExtra(db, TODAY, 500)).toBe(750);
    expect(addExtra(db, TODAY, -750)).toBe(0);
  });

  it('nie pozwala zejść poniżej zera', () => {
    const db = createTestDb({ seed: true });
    expect(addExtra(db, TODAY, -500)).toBe(0);
  });
});

describe('czas treningów', () => {
  it('sumuje zakończone treningi dnia', () => {
    const db = createTestDb({ seed: true });
    training(db, at(10, 6), 3600);
    training(db, at(10, 18), 1800);
    training(db, at(9, 6), 7200);

    expect(trainingSecondsOn(db, TODAY)).toBe(5400);
    expect(trainingSecondsOn(db, '2026-10-09')).toBe(7200);
  });

  it('trening przed północą należy do dnia, w którym się odbył', () => {
    const db = createTestDb({ seed: true });
    training(db, at(10, 22, 30), 3600);

    expect(trainingSecondsOn(db, TODAY)).toBe(3600);
    expect(trainingSecondsOn(db, '2026-10-11')).toBe(0);
  });

  it('pomija trening, który jeszcze trwa', () => {
    const db = createTestDb({ seed: true });
    db.insert(schema.workoutSessions)
      .values({ sport: 'RUNNING', status: 'IN_PROGRESS', startTime: at(10, 9).toISOString() })
      .run();

    expect(trainingSecondsOn(db, TODAY)).toBe(0);
  });
});

describe('dailySummaries', () => {
  it('zwraca też dni bez ani jednej porcji', () => {
    const db = createTestDb({ seed: true });
    logDrink(db, 500, at(10, 9));

    const days = dailySummaries(db, '2026-10-08', TODAY);
    expect(days.map((day) => day.dayKey)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10']);
    expect(days.map((day) => day.milliliters)).toEqual([0, 0, 500]);
  });

  it('dokłada do każdego dnia jego trening i korektę', () => {
    const db = createTestDb({ seed: true });
    logDrink(db, 500, at(10, 9));
    training(db, at(10, 6), 3600);
    addExtra(db, TODAY, 250);

    const [day] = dailySummaries(db, TODAY, TODAY);
    expect(day).toEqual({
      dayKey: TODAY,
      milliliters: 500,
      trainingSeconds: 3600,
      extraMl: 250,
    });
  });
});
