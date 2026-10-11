/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { savePlan } from '@/features/plans/repository';
import { completeSet, finishSession, loadSession, startSession } from '@/features/workout/repository';

import { suggestedTarget } from '../repository';
import { type DoneSet, nextTarget } from '../targets';

const KG = ' kg';

const set = (over: Partial<DoneSet> = {}): DoneSet => ({
  reps: null,
  weightKg: null,
  rpe: null,
  durationSeconds: null,
  ...over,
});

describe('nextTarget', () => {
  it('po komplecie na ciężarze podnosi ciężar, zostawiając serie i powtórzenia', () => {
    const target = nextTarget(
      [set({ reps: 8, weightKg: 80, rpe: 7 }), set({ reps: 8, weightKg: 80, rpe: 7 }), set({ reps: 8, weightKg: 80 })],
      'REPS',
    )!;
    expect(target).toMatchObject({ targetSets: 3, targetReps: 8, targetWeight: 85 });
    expect(target.reason).toContain(`Następnym razem 85${KG}`);
  });

  it('po niepełnym komplecie zostawia ciężar', () => {
    const target = nextTarget(
      [set({ reps: 8, weightKg: 80 }), set({ reps: 8, weightKg: 80 }), set({ reps: 6, weightKg: 80 })],
      'REPS',
    )!;
    expect(target).toMatchObject({ targetSets: 3, targetReps: 8, targetWeight: 80 });
    expect(target.reason).toContain(`Zostań przy 80${KG}`);
  });

  it('liczy serie z ciężaru docelowego, a nie z rozgrzewki', () => {
    const target = nextTarget(
      [
        set({ reps: 10, weightKg: 40 }),
        set({ reps: 8, weightKg: 80 }),
        set({ reps: 8, weightKg: 80 }),
        set({ reps: 8, weightKg: 80 }),
      ],
      'REPS',
    )!;
    expect(target).toMatchObject({ targetSets: 3, targetReps: 8, targetWeight: 85 });
  });

  it('bez ciężaru dokłada powtórzenie, a przy nierównych seriach każe je wyrównać', () => {
    expect(nextTarget([set({ reps: 12 }), set({ reps: 12 })], 'REPS')).toMatchObject({
      targetSets: 2,
      targetReps: 13,
      targetWeight: null,
    });
    expect(nextTarget([set({ reps: 12 }), set({ reps: 10 })], 'REPS')).toMatchObject({ targetReps: 12 });
    expect(nextTarget([set({ reps: 12, rpe: 9 }), set({ reps: 12, rpe: 10 })], 'REPS')).toMatchObject({
      targetReps: 12,
    });
  });

  it('na czas wydłuża o dziesięć sekund, ostrożniej przy wysokim RPE', () => {
    expect(nextTarget([set({ durationSeconds: 60 }), set({ durationSeconds: 55 })], 'TIME')).toMatchObject({
      targetSets: 2,
      targetDurationSeconds: 70,
      targetReps: null,
    });
    expect(nextTarget([set({ durationSeconds: 60, rpe: 8 })], 'TIME')).toMatchObject({
      targetDurationSeconds: 65,
    });
    expect(nextTarget([set({ durationSeconds: 60, rpe: 9 })], 'TIME')).toMatchObject({
      targetDurationSeconds: 60,
    });
  });

  it('milczy, gdy nie ma czego policzyć', () => {
    expect(nextTarget([], 'REPS')).toBeNull();
    expect(nextTarget([set({ weightKg: 80 })], 'REPS')).toBeNull();
    expect(nextTarget([set({ reps: 8 })], 'TIME')).toBeNull();
  });
});

function setup() {
  const db = createTestDb({ seed: true });
  const squat = db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.name, 'Przysiad ze sztangą'))
    .get()!;
  const planId = savePlan(db, {
    sport: 'STRENGTH',
    title: 'Plan',
    description: '',
    sourceTemplateId: null,
    items: [
      {
        key: 'a',
        exerciseId: squat.id,
        exerciseName: squat.name,
        trackingType: 'REPS',
        targetSets: 3,
        targetReps: 5,
        targetWeight: 100,
        targetDurationSeconds: null,
        restDurationSeconds: 120,
        notes: null,
      },
    ],
  });
  return { db, planId, squatId: squat.id };
}

describe('suggestedTarget', () => {
  it('bierze ostatni ukończony trening tego ćwiczenia', () => {
    const { db, planId, squatId } = setup();
    const session = startSession(db, { kind: 'plan', planId }, '2026-10-08T10:00:00.000Z');
    loadSession(db, session)!.exercises[0].sets.forEach((row, index) =>
      completeSet(db, row.id, { repsCompleted: 5, weightKg: 100, rpe: 7 }, `2026-10-08T10:0${index}:00.000Z`),
    );
    finishSession(db, session, {}, '2026-10-08T11:00:00.000Z');

    expect(suggestedTarget(db, squatId, 'REPS')).toMatchObject({
      targetSets: 3,
      targetReps: 5,
      targetWeight: 105,
    });
  });

  it('pomija trwający trening — jeszcze nie wiadomo, co z niego wyjdzie', () => {
    const { db, planId, squatId } = setup();
    const done = startSession(db, { kind: 'plan', planId }, '2026-10-08T10:00:00.000Z');
    loadSession(db, done)!.exercises[0].sets.forEach((row, index) =>
      completeSet(db, row.id, { repsCompleted: 5, weightKg: 100, rpe: 7 }, `2026-10-08T10:0${index}:00.000Z`),
    );
    finishSession(db, done, {}, '2026-10-08T11:00:00.000Z');

    const running = startSession(db, { kind: 'plan', planId }, '2026-10-10T10:00:00.000Z');
    completeSet(db, loadSession(db, running)!.exercises[0].sets[0].id, {
      repsCompleted: 5,
      weightKg: 60,
    });

    expect(suggestedTarget(db, squatId, 'REPS')).toMatchObject({ targetWeight: 105 });
  });

  it('nic nie podpowiada dla ćwiczenia, którego nigdy nie robiono', () => {
    const { db, squatId } = setup();
    expect(suggestedTarget(db, squatId, 'REPS')).toBeNull();
  });
});
