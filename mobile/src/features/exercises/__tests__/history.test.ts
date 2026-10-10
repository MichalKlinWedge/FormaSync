/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  describeBest,
  describeChange,
  summarizeExercise,
  type ExerciseSetRecord,
} from '../history';

/** Spacja nierozdzielająca — tak formatuje ciężary `formatKg`, więc tak muszą wyglądać oczekiwania. */
const KG = ' kg';

const set = (over: Partial<ExerciseSetRecord> & { sessionId: number }): ExerciseSetRecord => ({
  startTime: '2026-10-01T10:00:00.000Z',
  reps: 5,
  weightKg: 100,
  durationSeconds: null,
  rpe: null,
  ...over,
});

/** Trening: kilka serii tego samego dnia, zapisanych w jednej sesji. */
const workout = (
  sessionId: number,
  startTime: string,
  sets: Partial<ExerciseSetRecord>[],
): ExerciseSetRecord[] => sets.map((over) => set({ sessionId, startTime, ...over }));

describe('summarizeExercise', () => {
  it('ćwiczenia nigdy niewykonanego nie opisuje', () => {
    expect(summarizeExercise([], 'REPS')).toBeNull();
  });

  it('liczy treningi po sesjach, a nie po seriach', () => {
    const result = summarizeExercise(
      [
        ...workout(1, '2026-09-01T10:00:00.000Z', [{}, {}, {}]),
        ...workout(2, '2026-09-08T10:00:00.000Z', [{}, {}]),
      ],
      'REPS',
    );
    expect(result).toMatchObject({ sessions: 2, sets: 5 });
    expect(result?.firstAt).toBe('2026-09-01T10:00:00.000Z');
    expect(result?.lastAt).toBe('2026-09-08T10:00:00.000Z');
  });

  it('za najlepszą serię bierze najwyższy szacowany 1RM, a nie sam ciężar', () => {
    // 110 × 1 to mniej niż 100 × 5 — cięższa sztanga nie zawsze znaczy lepszą serię.
    const result = summarizeExercise(
      workout(1, '2026-09-01T10:00:00.000Z', [
        { weightKg: 110, reps: 1 },
        { weightKg: 100, reps: 5 },
      ]),
      'REPS',
    );
    expect(result?.best).toMatchObject({ weightKg: 100, reps: 5 });
  });

  it('postęp liczy między pierwszym a ostatnim treningiem', () => {
    const result = summarizeExercise(
      [
        ...workout(1, '2026-09-01T10:00:00.000Z', [{ weightKg: 100, reps: 5 }]),
        ...workout(2, '2026-09-08T10:00:00.000Z', [{ weightKg: 110, reps: 5 }]),
      ],
      'REPS',
    );
    // 1RM rośnie z ~116,7 do ~128,3 kg.
    expect(result?.change).toBeCloseTo(11.7, 1);
    expect(describeChange(result!.change!, 'WEIGHT')).toBe(`+11,7${KG}`);
  });

  it('przy jednym treningu nie udaje, że zna postęp', () => {
    const result = summarizeExercise(workout(1, '2026-09-01T10:00:00.000Z', [{}]), 'REPS');
    expect(result?.change).toBeNull();
  });
});

describe('sugestia na kolejny trening', () => {
  const adviceFor = (sets: Partial<ExerciseSetRecord>[], tracking: 'REPS' | 'TIME' = 'REPS') =>
    summarizeExercise(workout(1, '2026-09-01T10:00:00.000Z', sets), tracking)?.advice ?? '';

  it('komplet serii przy niskim RPE podnosi ciężar', () => {
    const advice = adviceFor([
      { weightKg: 100, reps: 5, rpe: 7 },
      { weightKg: 100, reps: 5, rpe: 7 },
      { weightKg: 100, reps: 5, rpe: 7 },
    ]);
    expect(advice).toContain('czas na więcej');
    expect(advice).toContain(`105${KG}`);
  });

  it('przy RPE 8 podnosi ostrożniej', () => {
    const advice = adviceFor([
      { weightKg: 100, reps: 5, rpe: 8 },
      { weightKg: 100, reps: 5, rpe: 8 },
    ]);
    expect(advice).toContain(`102,5${KG}`);
  });

  it('przy RPE 9 każe zostać przy tym samym ciężarze', () => {
    const advice = adviceFor([
      { weightKg: 100, reps: 5, rpe: 9 },
      { weightKg: 100, reps: 5, rpe: 9 },
    ]);
    expect(advice).toContain(`Zostań przy 100${KG}`);
  });

  it('serie rozgrzewkowe nie psują oceny', () => {
    // Liczy się to, co poszło na docelowym ciężarze: 3 × 5 przy 100 kg, mimo lżejszego wstępu.
    const advice = adviceFor([
      { weightKg: 60, reps: 10, rpe: 4 },
      { weightKg: 100, reps: 5, rpe: 7 },
      { weightKg: 100, reps: 5, rpe: 7 },
      { weightKg: 100, reps: 5, rpe: 7 },
    ]);
    expect(advice).toContain(`105${KG}`);
  });

  it('nierówne serie każą najpierw wyrównać, a nie dokładać', () => {
    const advice = adviceFor([
      { weightKg: 100, reps: 5, rpe: 8 },
      { weightKg: 100, reps: 3, rpe: 9 },
    ]);
    expect(advice).toContain('powtórz ten ciężar');
    expect(advice).toContain(`Zostań przy 100${KG}`);
  });

  it('ćwiczenie na masie ciała rośnie powtórzeniami, nie kilogramami', () => {
    const advice = adviceFor([
      { weightKg: null, reps: 12, rpe: 6 },
      { weightKg: null, reps: 12, rpe: 6 },
      { weightKg: null, reps: 12, rpe: 6 },
    ]);
    expect(advice).toContain('3 × 13');
    expect(advice).not.toContain('kg');
  });

  it('na masie ciała przy wysokim RPE nie dokłada powtórzeń', () => {
    const advice = adviceFor([
      { weightKg: null, reps: 8, rpe: 9 },
      { weightKg: null, reps: 8, rpe: 10 },
    ]);
    expect(advice).toContain('powtórz ten sam układ');
  });

  it('ćwiczenie na czas dokłada sekundy', () => {
    const advice = adviceFor(
      [{ weightKg: null, reps: null, durationSeconds: 60, rpe: 6 }],
      'TIME',
    );
    expect(advice).toContain('70 s');
  });

  it('ćwiczenie na czas przy wysokim RPE zostaje przy swoim', () => {
    const advice = adviceFor(
      [{ weightKg: null, reps: null, durationSeconds: 90, rpe: 9 }],
      'TIME',
    );
    expect(advice).toContain('powtórz ten sam czas');
  });
});

describe('describeBest', () => {
  const best = (over: Partial<Parameters<typeof describeBest>[0]> = {}) => ({
    startTime: '2026-09-01T10:00:00.000Z',
    reps: 5,
    weightKg: 100,
    durationSeconds: null,
    oneRepMax: 116.67,
    ...over,
  });

  it('przy ciężarze podaje serię i szacowany 1RM', () => {
    expect(describeBest(best(), 'WEIGHT')).toBe(`100${KG} × 5 · 1RM ok. 117${KG}`);
  });

  it('bez ciężaru zostają same powtórzenia', () => {
    expect(describeBest(best({ weightKg: null, oneRepMax: null, reps: 14 }), 'REPS')).toBe('14 powt.');
  });

  it('przy czasie podaje sekundy', () => {
    expect(describeBest(best({ durationSeconds: 75 }), 'TIME')).toBe('75 s');
  });
});

describe('describeChange', () => {
  it('brak różnicy nazywa wprost, zamiast pokazywać zero', () => {
    expect(describeChange(0, 'WEIGHT')).toBe('bez zmian');
  });

  it('spadek pokazuje minusem', () => {
    expect(describeChange(-5, 'WEIGHT')).toBe(`−5${KG}`);
    expect(describeChange(-2, 'REPS')).toBe('−2 powt.');
  });
});
