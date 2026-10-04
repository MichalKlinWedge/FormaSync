/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { loadPlanDraft, savePlan } from '@/features/plans/repository';
import { completeSet, finishSession, loadSession, startSession } from '@/features/workout/repository';

import {
  applyProgression,
  type ExercisePerformance,
  proposeProgression,
  suggestProgression,
} from '../progression';

const performance = (overrides: Partial<ExercisePerformance> = {}): ExercisePerformance => ({
  planExerciseId: 1,
  exerciseName: 'Przysiad',
  targetSets: 3,
  targetReps: 8,
  targetWeight: 100,
  sets: [],
  ...overrides,
});

const done = (reps: number, rpe: number | null = null) => ({ reps, weightKg: 100, rpe });

describe('suggestProgression', () => {
  it('podnosi o 5% po komplecie serii przy niskim RPE', () => {
    const suggestion = suggestProgression(performance({ sets: [done(8, 7), done(8, 7), done(8, 6)] }))!;
    expect(suggestion).toMatchObject({ advice: 'INCREASE', currentWeight: 100, suggestedWeight: 105 });
    expect(suggestion.reason).toContain('RPE 6,7');
  });

  it('podnosi ostrożniej przy RPE 8', () => {
    const suggestion = suggestProgression(performance({ sets: [done(8, 8), done(8, 8), done(8, 8)] }))!;
    expect(suggestion).toMatchObject({ advice: 'INCREASE', suggestedWeight: 102.5 });
  });

  it('utrzymuje ciężar przy RPE 9 i wyżej', () => {
    const suggestion = suggestProgression(performance({ sets: [done(8, 9), done(8, 10), done(8, 9)] }))!;
    expect(suggestion).toMatchObject({ advice: 'HOLD', suggestedWeight: 100 });
  });

  it('bez ocen RPE traktuje komplet jako gotowość do progresji', () => {
    const suggestion = suggestProgression(performance({ sets: [done(8), done(8), done(8)] }))!;
    expect(suggestion).toMatchObject({ advice: 'INCREASE', suggestedWeight: 105 });
    expect(suggestion.reason).not.toContain('RPE');
  });

  it('utrzymuje ciężar, gdy zabrakło powtórzeń lub serii', () => {
    expect(suggestProgression(performance({ sets: [done(8), done(8), done(6)] }))).toMatchObject({
      advice: 'HOLD',
      suggestedWeight: 100,
    });
    expect(suggestProgression(performance({ sets: [done(8), done(8)] }))).toMatchObject({
      advice: 'HOLD',
      suggestedWeight: 100,
    });
  });

  it('obniża ciężar, gdy wykonano mniej niż połowę pracy', () => {
    const suggestion = suggestProgression(performance({ sets: [done(5), done(4)] }))!;
    expect(suggestion).toMatchObject({ advice: 'DECREASE', suggestedWeight: 95 });
    expect(suggestion.reason).toContain('9 z 24');
  });

  it('zawsze zmienia ciężar o co najmniej jeden krok', () => {
    // 5% z 20 kg to 1 kg — zaokrąglenie do 2,5 kg dałoby brak zmiany.
    expect(suggestProgression(performance({ targetWeight: 20, sets: [done(8), done(8), done(8)] }))).toMatchObject({
      suggestedWeight: 22.5,
    });
    expect(suggestProgression(performance({ targetWeight: 20, sets: [done(1), done(1)] }))).toMatchObject({
      suggestedWeight: 17.5,
    });
  });

  it('pomija ćwiczenia, których nie da się ocenić', () => {
    expect(suggestProgression(performance({ targetWeight: null }))).toBeNull();
    expect(suggestProgression(performance({ targetReps: null, sets: [done(8)] }))).toBeNull();
    expect(suggestProgression(performance({ sets: [] }))).toBeNull();
  });
});

function setup() {
  const db = createTestDb({ seed: true });
  const byName = (name: string) =>
    db.select().from(schema.exercises).where(eq(schema.exercises.name, name)).get()!;
  const squat = byName('Przysiad ze sztangą');
  const plank = byName('Plank (deska)');

  const planId = savePlan(db, {
    sport: 'STRENGTH',
    title: 'Mój plan',
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
      {
        key: 'b',
        exerciseId: plank.id,
        exerciseName: plank.name,
        trackingType: 'TIME',
        targetSets: 1,
        targetReps: null,
        targetWeight: null,
        targetDurationSeconds: 45,
        restDurationSeconds: 60,
        notes: null,
      },
    ],
  });
  return { db, planId };
}

describe('proposeProgression', () => {
  it('opiera się na ostatniej ukończonej sesji planu', () => {
    const { db, planId } = setup();

    // Starsza sesja: słabe wykonanie.
    const first = startSession(db, { kind: 'plan', planId }, '2026-10-01T10:00:00.000Z');
    const firstSets = loadSession(db, first)!.exercises[0].sets;
    completeSet(db, firstSets[0].id, { repsCompleted: 2, weightKg: 100, rpe: 10 }, '2026-10-01T10:05:00.000Z');
    finishSession(db, first, {}, '2026-10-01T11:00:00.000Z');

    // Nowsza sesja: komplet przy niskim RPE.
    const second = startSession(db, { kind: 'plan', planId }, '2026-10-08T10:00:00.000Z');
    const secondSets = loadSession(db, second)!.exercises[0].sets;
    secondSets.forEach((set, index) =>
      completeSet(db, set.id, { repsCompleted: 5, weightKg: 100, rpe: 7 }, `2026-10-08T10:0${index}:00.000Z`),
    );
    finishSession(db, second, {}, '2026-10-08T11:00:00.000Z');

    const proposal = proposeProgression(db, planId)!;
    expect(proposal.planTitle).toBe('Mój plan');
    expect(proposal.basedOn).toBe('2026-10-08T10:00:00.000Z');
    // Plank nie ma ciężaru ani celu powtórzeń, więc nie ma dla niego sugestii.
    expect(proposal.suggestions).toHaveLength(1);
    expect(proposal.suggestions[0]).toMatchObject({
      exerciseName: 'Przysiad ze sztangą',
      advice: 'INCREASE',
      currentWeight: 100,
      suggestedWeight: 105,
    });
  });

  it('zapisuje zaakceptowane ciężary w planie', () => {
    const { db, planId } = setup();
    const session = startSession(db, { kind: 'plan', planId }, '2026-10-08T10:00:00.000Z');
    loadSession(db, session)!.exercises[0].sets.forEach((set, index) =>
      completeSet(db, set.id, { repsCompleted: 5, weightKg: 100, rpe: 6 }, `2026-10-08T10:0${index}:00.000Z`),
    );
    finishSession(db, session, {}, '2026-10-08T11:00:00.000Z');

    applyProgression(db, proposeProgression(db, planId)!.suggestions);
    expect(loadPlanDraft(db, planId).items[0].targetWeight).toBe(105);
    // Ćwiczenie na czas pozostaje nietknięte.
    expect(loadPlanDraft(db, planId).items[1].targetDurationSeconds).toBe(45);
  });

  it('brak propozycji dla planu bez historii i dla szablonu', () => {
    const { db, planId } = setup();
    expect(proposeProgression(db, planId)).toBeNull();

    const template = db
      .select()
      .from(schema.workoutPlans)
      .where(eq(schema.workoutPlans.isTemplate, true))
      .get()!;
    expect(proposeProgression(db, template.id)).toBeNull();
  });
});
