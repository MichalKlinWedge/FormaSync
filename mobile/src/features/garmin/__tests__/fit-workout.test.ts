/**
 * @jest-environment node
 */
import { Decoder, Stream } from '@garmin/fitsdk';
import { describe, expect, it } from '@jest/globals';

import {
  buildWorkoutFit,
  buildWorkoutSteps,
  type FitExercise,
  FitExportError,
  fitFileName,
  MAX_STEPS,
  toFitCategory,
} from '../fit-workout';

const squat = (overrides: Partial<FitExercise> = {}): FitExercise => ({
  name: 'Przysiad ze sztangą',
  garminCategory: 'SQUAT',
  trackingType: 'REPS',
  targetSets: 2,
  targetReps: 5,
  targetWeight: 100,
  targetDurationSeconds: null,
  restDurationSeconds: 120,
  ...overrides,
});

const plank = (overrides: Partial<FitExercise> = {}): FitExercise => ({
  name: 'Plank (deska)',
  garminCategory: 'PLANK',
  trackingType: 'TIME',
  targetSets: 1,
  targetReps: null,
  targetWeight: null,
  targetDurationSeconds: 45,
  restDurationSeconds: 60,
  ...overrides,
});

const decode = (bytes: Uint8Array) => {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  expect(decoder.isFIT()).toBe(true);
  expect(decoder.checkIntegrity()).toBe(true);
  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  return {
    fileId: messages.fileIdMesgs?.[0],
    workout: messages.workoutMesgs?.[0],
    steps: messages.workoutStepMesgs ?? [],
  };
};

describe('toFitCategory', () => {
  it('zamienia nasz zapis na słownik FIT', () => {
    expect(toFitCategory('BENCH_PRESS')).toBe('benchPress');
    expect(toFitCategory('SQUAT')).toBe('squat');
    expect(toFitCategory('TRICEPS_EXTENSION')).toBe('tricepsExtension');
  });

  it('zwraca null dla kategorii spoza słownika', () => {
    expect(toFitCategory('NIE_ISTNIEJE')).toBeNull();
    expect(toFitCategory(null)).toBeNull();
  });
});

describe('buildWorkoutSteps', () => {
  it('tworzy krok na każdą serię i przerwę pomiędzy nimi', () => {
    const steps = buildWorkoutSteps([squat(), plank()]);
    // 2 serie przysiadu + 2 przerwy + 1 plank = 5 kroków; po ostatniej serii nie ma przerwy.
    expect(steps.map((s) => s.intensity)).toEqual(['active', 'rest', 'active', 'rest', 'active']);
    expect(steps.at(-1)).toMatchObject({ wktStepName: 'Plank (deska)', durationType: 'time' });
  });

  it('pomija przerwę, gdy jej czas wynosi zero', () => {
    const steps = buildWorkoutSteps([squat({ targetSets: 2, restDurationSeconds: 0 })]);
    expect(steps.map((s) => s.intensity)).toEqual(['active', 'active']);
  });

  it('zapisuje czas w milisekundach, a powtórzenia wprost', () => {
    const [reps] = buildWorkoutSteps([squat({ targetSets: 1, restDurationSeconds: 0 })]);
    expect(reps).toMatchObject({ durationType: 'reps', durationValue: 5 });

    const [timed] = buildWorkoutSteps([plank({ restDurationSeconds: 0 })]);
    expect(timed).toMatchObject({ durationType: 'time', durationValue: 45000 });
  });

  it('dołącza ciężar tylko wtedy, gdy jest ustawiony', () => {
    const [withWeight] = buildWorkoutSteps([squat({ targetSets: 1, restDurationSeconds: 0 })]);
    expect(withWeight).toMatchObject({ exerciseWeight: 100, weightDisplayUnit: 'kilogram' });

    const [withoutWeight] = buildWorkoutSteps([
      squat({ targetSets: 1, restDurationSeconds: 0, targetWeight: null }),
    ]);
    expect(withoutWeight.exerciseWeight).toBeUndefined();
  });
});

describe('buildWorkoutFit', () => {
  it('tworzy poprawny plik, który daje się odczytać z powrotem', () => {
    const bytes = buildWorkoutFit('Mój plan', [squat(), plank()], new Date('2026-10-01T10:00:00Z'));
    const result = decode(bytes);

    expect(result.fileId).toMatchObject({ type: 'workout' });
    expect(result.workout).toMatchObject({
      wktName: 'Mój plan',
      sport: 'training',
      subSport: 'strengthTraining',
      numValidSteps: 5,
    });
    expect(result.steps).toHaveLength(5);
  });

  it('zachowuje ciężar ułamkowy i kategorię ćwiczenia', () => {
    const bytes = buildWorkoutFit('x', [
      squat({ targetSets: 1, restDurationSeconds: 0, targetWeight: 62.5 }),
    ]);
    expect(decode(bytes).steps[0]).toMatchObject({
      exerciseCategory: 'squat',
      exerciseWeight: 62.5,
      durationReps: 5,
    });
  });

  it('skraca za długie nazwy', () => {
    const longName = 'Bardzo długa nazwa ćwiczenia, która nie zmieści się na zegarku';
    const bytes = buildWorkoutFit(longName, [squat({ name: longName, targetSets: 1, restDurationSeconds: 0 })]);
    const result = decode(bytes);
    expect(result.workout?.wktName?.length).toBeLessThanOrEqual(30);
    expect(result.steps[0].wktStepName?.length).toBeLessThanOrEqual(30);
  });

  it('odrzuca pusty plan i plan ponad limit kroków', () => {
    expect(() => buildWorkoutFit('x', [])).toThrow(FitExportError);
    const huge = squat({ targetSets: MAX_STEPS, restDurationSeconds: 0 });
    expect(() => buildWorkoutFit('x', [huge, huge])).toThrow(/najwyżej 200/);
  });

  it('działa bez obsługi powiększania buforów, której brakuje silnikowi telefonu', () => {
    // Hermes ignoruje opcję maxByteLength i nie ma metody resize. Plik musi zmieścić się
    // w buforze początkowym — ten test pilnuje, że tak pozostanie.
    const original = globalThis.ArrayBuffer;
    const Fixed = function (length: number) {
      return new original(length);
    } as unknown as ArrayBufferConstructor;
    Object.defineProperty(Fixed, 'prototype', { value: original.prototype });
    Object.setPrototypeOf(Fixed, original);
    globalThis.ArrayBuffer = Fixed;
    try {
      const exercises = Array.from({ length: 20 }, () => squat({ targetSets: 4 }));
      const bytes = buildWorkoutFit('Długi plan', exercises);
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.length).toBeLessThan(100_000);
    } finally {
      globalThis.ArrayBuffer = original;
    }
  });
});

describe('fitFileName', () => {
  it('usuwa polskie znaki i znaki specjalne', () => {
    expect(fitFileName('PPL — Push (pchanie)')).toBe('ppl-push-pchanie.fit');
    expect(fitFileName('Trening ćwiczeń łatwy')).toBe('trening-cwiczen-latwy.fit');
    expect(fitFileName('!!!')).toBe('trening.fit');
  });
});
