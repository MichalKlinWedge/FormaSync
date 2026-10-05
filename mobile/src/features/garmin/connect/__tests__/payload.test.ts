/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  buildWorkoutPayload,
  EmptyPlanError,
  type GarminExercise,
  type GarminPlan,
  type GarminSegment,
} from '../payload';
import reference from './reference-payloads.json';

/**
 * Wzorzec w `reference-payloads.json` to dosłownie to, co wysyła działające narzędzie pythonowe
 * (`tools/garmin`) dla planów z `tools/garmin/example-backup.json`. Garmin nie dokumentuje tego
 * API, więc jedynym wiarygodnym sprawdzianem portu jest zgodność z treścią, którą Garmin już
 * przyjmuje. Plik odtwarza się poleceniem opisanym w README narzędzia.
 */

const segment = (over: Partial<GarminSegment> = {}): GarminSegment => ({
  kind: 'WORK',
  durationType: 'OPEN',
  distanceMeters: null,
  durationSeconds: null,
  targetType: 'NONE',
  targetLow: null,
  targetHigh: null,
  repeatCount: null,
  children: [],
  ...over,
});

const exercise = (over: Partial<GarminExercise> = {}): GarminExercise => ({
  name: 'Ćwiczenie',
  garminCategory: 'SQUAT',
  trackingType: 'REPS',
  targetSets: 3,
  targetReps: 5,
  targetWeight: null,
  targetDurationSeconds: null,
  restDurationSeconds: 90,
  ...over,
});

const plan = (over: Partial<GarminPlan>): GarminPlan => ({
  title: 'Plan',
  sport: 'STRENGTH',
  exercises: [],
  segments: [],
  ...over,
});

describe('zgodność z narzędziem, które Garmin już przyjmuje', () => {
  it('plan siłowy wychodzi identycznie', () => {
    const payload = buildWorkoutPayload(
      plan({
        title: 'Mój plan',
        sport: 'STRENGTH',
        exercises: [
          exercise({ garminCategory: 'SQUAT', targetSets: 3, targetReps: 5, targetWeight: 100, restDurationSeconds: 120 }),
          exercise({
            garminCategory: 'PLANK',
            trackingType: 'TIME',
            targetSets: 2,
            targetReps: null,
            targetDurationSeconds: 45,
            restDurationSeconds: 60,
          }),
          // Ćwiczenie bez kategorii Garmina — ma pojechać jako UNKNOWN, a nie wywrócić wysyłki.
          exercise({ garminCategory: null, targetSets: 2, targetReps: 8, restDurationSeconds: 90 }),
        ],
      }),
    );
    expect(payload).toEqual(reference['Mój plan']);
  });

  it('plan biegowy z grupą powtórzeń wychodzi identycznie', () => {
    const payload = buildWorkoutPayload(
      plan({
        title: 'Interwały 5×400',
        sport: 'RUNNING',
        segments: [
          segment({ kind: 'WARMUP', durationType: 'TIME', durationSeconds: 600 }),
          segment({
            kind: 'REPEAT',
            repeatCount: 5,
            children: [
              segment({
                kind: 'WORK',
                durationType: 'DISTANCE',
                distanceMeters: 400,
                targetType: 'PACE',
                targetLow: 240,
                targetHigh: 255,
              }),
              segment({ kind: 'RECOVERY', durationType: 'TIME', durationSeconds: 90 }),
            ],
          }),
          segment({
            kind: 'COOLDOWN',
            durationType: 'TIME',
            durationSeconds: 600,
            targetType: 'HEART_RATE',
            targetLow: 120,
            targetHigh: 140,
          }),
        ],
      }),
    );
    expect(payload).toEqual(reference['Interwały 5×400']);
  });
});

describe('cele odcinka', () => {
  const stepOf = (over: Partial<GarminSegment>) => {
    const payload = buildWorkoutPayload(plan({ sport: 'RUNNING', segments: [segment(over)] })) as {
      workoutSegments: { workoutSteps: Record<string, unknown>[] }[];
    };
    return payload.workoutSegments[0].workoutSteps[0];
  };

  it('tempo idzie jako prędkość w metrach na sekundę, nie jako sekundy na kilometr', () => {
    // 4:00/km to 4,1667 m/s, 4:15/km to 3,9216 m/s. Szybsze tempo daje wyższą prędkość,
    // więc granice zamieniają się miejscami.
    const step = stepOf({ targetType: 'PACE', targetLow: 240, targetHigh: 255 });
    expect(step.targetValueOne).toBeCloseTo(3.9216, 4);
    expect(step.targetValueTwo).toBeCloseTo(4.1667, 4);
  });

  it('tętno idzie jako uderzenia na minutę, bez przeliczania', () => {
    const step = stepOf({ targetType: 'HEART_RATE', targetLow: 120, targetHigh: 140 });
    expect(step).toMatchObject({ targetValueOne: 120, targetValueTwo: 140 });
  });

  it('niepełny zakres to brak celu, a nie połowiczny cel', () => {
    const step = stepOf({ targetType: 'PACE', targetLow: 240, targetHigh: null });
    expect(step.targetType).toMatchObject({ workoutTargetTypeKey: 'no.target' });
    expect(step.targetValueOne).toBeUndefined();
  });
});

describe('warunek końca odcinka', () => {
  const endOf = (over: Partial<GarminSegment>) => {
    const payload = buildWorkoutPayload(plan({ sport: 'CYCLING', segments: [segment(over)] })) as {
      workoutSegments: { workoutSteps: Record<string, unknown>[] }[];
    };
    return payload.workoutSegments[0].workoutSteps[0];
  };

  it('odcinek na dystans kończy dystans', () => {
    expect(endOf({ durationType: 'DISTANCE', distanceMeters: 5000 })).toMatchObject({
      endCondition: { conditionTypeKey: 'distance' },
      endConditionValue: 5000,
    });
  });

  it('odcinek na czas kończy czas', () => {
    expect(endOf({ durationType: 'TIME', durationSeconds: 300 })).toMatchObject({
      endCondition: { conditionTypeKey: 'time' },
      endConditionValue: 300,
    });
  });

  it('odcinek otwarty kończy przycisk na zegarku', () => {
    expect(endOf({ durationType: 'OPEN' })).toMatchObject({
      endCondition: { conditionTypeKey: 'lap.button' },
      endConditionValue: 0,
    });
  });

  it('dystans zadeklarowany, ale pusty, traktujemy jak odcinek otwarty', () => {
    expect(endOf({ durationType: 'DISTANCE', distanceMeters: null })).toMatchObject({
      endCondition: { conditionTypeKey: 'lap.button' },
    });
  });
});

describe('dyscyplina', () => {
  it.each([
    ['RUNNING', 'running'],
    ['CYCLING', 'cycling'],
    ['SWIMMING', 'swimming'],
  ] as const)('%s jedzie jako %s', (sport, key) => {
    const payload = buildWorkoutPayload(
      plan({ sport, segments: [segment({ durationType: 'DISTANCE', distanceMeters: 100 })] }),
    ) as { sportType: { sportTypeKey: string } };
    expect(payload.sportType.sportTypeKey).toBe(key);
  });

  it('siła jedzie jako strength_training', () => {
    const payload = buildWorkoutPayload(plan({ exercises: [exercise()] })) as {
      sportType: { sportTypeKey: string };
    };
    expect(payload.sportType.sportTypeKey).toBe('strength_training');
  });
});

describe('odmowy', () => {
  it('plan bez treści nie jedzie nigdzie', () => {
    expect(() => buildWorkoutPayload(plan({}))).toThrow(EmptyPlanError);
    expect(() => buildWorkoutPayload(plan({ sport: 'RUNNING' }))).toThrow(EmptyPlanError);
  });

  it('nazwa dłuższa niż osiemdziesiąt znaków zostaje ucięta po naszej stronie', () => {
    const payload = buildWorkoutPayload(
      plan({ title: 'x'.repeat(200), exercises: [exercise()] }),
    ) as { workoutName: string };
    expect(payload.workoutName).toHaveLength(80);
  });
});
