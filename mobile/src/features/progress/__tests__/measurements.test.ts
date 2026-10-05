/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { createTestDb } from '@/db/test-utils';

import {
  listMeasurements,
  type MeasurementInput,
  MeasurementValidationError,
  saveMeasurement,
} from '../repository';

const input = (over: Partial<MeasurementInput> = {}): MeasurementInput => ({
  measuredOn: '2026-10-05',
  weightKg: null,
  bodyFatPercent: null,
  chestCm: null,
  waistCm: null,
  hipsCm: null,
  armCm: null,
  thighCm: null,
  systolic: null,
  diastolic: null,
  notes: null,
  ...over,
});

describe('ciśnienie w pomiarach', () => {
  it('zapisuje się jako para i wraca z listy', () => {
    const db = createTestDb({ seed: true });
    saveMeasurement(db, input({ systolic: 124, diastolic: 78 }));

    expect(listMeasurements(db)[0]).toMatchObject({ systolic: 124, diastolic: 78 });
  });

  it('samo ciśnienie wystarczy — nie trzeba ważyć się przy okazji', () => {
    const db = createTestDb({ seed: true });
    expect(() => saveMeasurement(db, input({ systolic: 120, diastolic: 80 }))).not.toThrow();
  });

  it('pojedyncza wartość to za mało', () => {
    const db = createTestDb({ seed: true });
    expect(() => saveMeasurement(db, input({ systolic: 120 }))).toThrow(MeasurementValidationError);
    expect(() => saveMeasurement(db, input({ diastolic: 80 }))).toThrow(MeasurementValidationError);
  });

  it('odwrócona para to pomyłka przy przepisywaniu', () => {
    const db = createTestDb({ seed: true });
    expect(() => saveMeasurement(db, input({ systolic: 80, diastolic: 120 }))).toThrow(
      /wyższe od rozkurczowego/,
    );
  });

  it('równe wartości też nie mają sensu', () => {
    const db = createTestDb({ seed: true });
    expect(() => saveMeasurement(db, input({ systolic: 100, diastolic: 100 }))).toThrow(
      MeasurementValidationError,
    );
  });

  it('literówka w rzędzie wielkości jest zatrzymywana', () => {
    const db = createTestDb({ seed: true });
    expect(() => saveMeasurement(db, input({ systolic: 1200, diastolic: 80 }))).toThrow(/literówka/);
  });

  it('wartości skrajne, ale możliwe, przechodzą — to nie jest ocena zdrowia', () => {
    const db = createTestDb({ seed: true });
    expect(() => saveMeasurement(db, input({ systolic: 200, diastolic: 130 }))).not.toThrow();
  });

  it('pomiar z tą samą datą jest uzupełniany, a nie dublowany', () => {
    const db = createTestDb({ seed: true });
    saveMeasurement(db, input({ systolic: 124, diastolic: 78 }));
    saveMeasurement(db, input({ systolic: 118, diastolic: 74 }));

    const all = listMeasurements(db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ systolic: 118, diastolic: 74 });
  });
});

describe('zapis tego samego dnia', () => {
  it('samo ciśnienie nie kasuje wagi zmierzonej rano', () => {
    const db = createTestDb({ seed: true });
    saveMeasurement(db, input({ weightKg: 77, waistCm: 90 }));
    saveMeasurement(db, input({ systolic: 124, diastolic: 78 }));

    expect(listMeasurements(db)[0]).toMatchObject({
      weightKg: 77,
      waistCm: 90,
      systolic: 124,
      diastolic: 78,
    });
  });

  it('nowa wartość nadpisuje starą — poprawka wagi działa', () => {
    const db = createTestDb({ seed: true });
    saveMeasurement(db, input({ weightKg: 77 }));
    saveMeasurement(db, input({ weightKg: 76.4 }));

    expect(listMeasurements(db)[0].weightKg).toBe(76.4);
  });

  it('notatka z wcześniejszego zapisu zostaje', () => {
    const db = createTestDb({ seed: true });
    saveMeasurement(db, input({ weightKg: 77, notes: 'rano, na czczo' }));
    saveMeasurement(db, input({ systolic: 124, diastolic: 78 }));

    expect(listMeasurements(db)[0].notes).toBe('rano, na czczo');
  });
});
