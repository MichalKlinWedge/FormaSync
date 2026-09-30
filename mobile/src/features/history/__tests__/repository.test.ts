/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { loadPlanDraft, savePlan } from '@/features/plans/repository';
import {
  abandonSession,
  completeSet,
  finishSession,
  loadSession,
  startSession,
} from '@/features/workout/repository';

import {
  applyPlanUpdate,
  deleteSession,
  describeChange,
  listHistory,
  proposePlanUpdate,
  updateSessionMeta,
} from '../repository';

const T0 = '2026-10-01T10:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();

function setup() {
  const db = createTestDb({ seed: true });
  const squat = db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.name, 'Przysiad ze sztangą'))
    .get()!;
  const plank = db.select().from(schema.exercises).where(eq(schema.exercises.name, 'Plank (deska)')).get()!;

  const planId = savePlan(db, {
    title: 'Mój plan',
    description: '',
    sourceTemplateId: null,
    items: [
      {
        key: 'a',
        exerciseId: squat.id,
        exerciseName: squat.name,
        trackingType: 'REPS',
        targetSets: 2,
        targetReps: 8,
        targetWeight: 60,
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
        targetDurationSeconds: 30,
        restDurationSeconds: 60,
        notes: null,
      },
    ],
  });
  return { db, planId, squat, plank };
}

/** Rozegrany trening: przysiad 2 serie po 65 kg, plank 40 s. */
function recordSession(db: ReturnType<typeof createTestDb>, planId: number) {
  const id = startSession(db, { kind: 'plan', planId }, T0);
  const session = loadSession(db, id)!;
  const [squat, plank] = session.exercises;
  completeSet(db, squat.sets[0].id, { repsCompleted: 8, weightKg: 65 }, at(60));
  completeSet(db, squat.sets[1].id, { repsCompleted: 6, weightKg: 65 }, at(200));
  completeSet(db, plank.sets[0].id, { durationSeconds: 40 }, at(400));
  finishSession(db, id, { userNotes: 'Mocne nogi', rpeRating: 8 }, at(1800));
  return id;
}

describe('listHistory', () => {
  it('zwraca zakończone treningi z tonażem i liczbą serii', () => {
    const { db, planId } = setup();
    const id = recordSession(db, planId);

    const [entry] = listHistory(db);
    expect(entry).toMatchObject({
      id,
      title: 'Mój plan',
      status: 'COMPLETED',
      durationSeconds: 1800,
      rpeRating: 8,
      userNotes: 'Mocne nogi',
      completedSets: 3,
      tonnage: 8 * 65 + 6 * 65,
    });
  });

  it('pomija trwającą sesję, pokazuje przerwaną', () => {
    const { db, planId } = setup();
    recordSession(db, planId);

    const abandoned = startSession(db, { kind: 'plan', planId }, at(5000));
    const sets = loadSession(db, abandoned)!.exercises[0].sets;
    completeSet(db, sets[0].id, { repsCompleted: 5, weightKg: 50 }, at(5100));
    abandonSession(db, abandoned, at(5400));

    const running = startSession(db, { kind: 'empty' }, at(9000));
    const history = listHistory(db);
    expect(history.map((h) => h.status)).toEqual(['ABANDONED', 'COMPLETED']);
    expect(history.map((h) => h.id)).not.toContain(running);
  });

  it('zachowuje nazwę treningu po usunięciu planu', () => {
    const { db, planId } = setup();
    recordSession(db, planId);
    db.delete(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).run();

    expect(listHistory(db)[0]).toMatchObject({ title: 'Mój plan' });
  });
});

describe('updateSessionMeta i deleteSession', () => {
  it('zapisuje poprawioną notatkę i ocenę', () => {
    const { db, planId } = setup();
    const id = recordSession(db, planId);
    updateSessionMeta(db, id, { userNotes: 'Poprawiona notatka', rpeRating: 6 });
    expect(listHistory(db)[0]).toMatchObject({ userNotes: 'Poprawiona notatka', rpeRating: 6 });
  });

  it('usuwa trening razem z seriami', () => {
    const { db, planId } = setup();
    const id = recordSession(db, planId);
    deleteSession(db, id);
    expect(listHistory(db)).toEqual([]);
    expect(db.select().from(schema.loggedSets).all()).toEqual([]);
    expect(db.select().from(schema.sessionExercises).all()).toEqual([]);
  });
});

describe('proposePlanUpdate', () => {
  it('proponuje cele z ostatniej wykonanej serii', () => {
    const { db, planId } = setup();
    const id = recordSession(db, planId);

    const proposal = proposePlanUpdate(db, id)!;
    expect(proposal.planTitle).toBe('Mój plan');
    expect(proposal.changes.map(describeChange)).toEqual([
      'Przysiad ze sztangą: ciężar 60 → 65',
      'Przysiad ze sztangą: powtórzenia 8 → 6',
      'Plank (deska): czas serii 30 → 40',
    ]);
  });

  it('zastosowanie zmienia plan, a historia pozostaje nietknięta', () => {
    const { db, planId } = setup();
    const id = recordSession(db, planId);
    const proposal = proposePlanUpdate(db, id)!;

    // Użytkownik zatwierdza tylko podniesienie ciężaru.
    applyPlanUpdate(
      db,
      proposal.changes.filter((c) => c.field === 'targetWeight'),
    );

    const plan = loadPlanDraft(db, planId);
    expect(plan.items[0]).toMatchObject({ targetWeight: 65, targetReps: 8 });
    expect(loadSession(db, id)!.exercises[0]).toMatchObject({ targetWeight: 60, targetReps: 8 });
    expect(proposePlanUpdate(db, id)!.changes.map((c) => c.field)).toEqual([
      'targetReps',
      'targetDurationSeconds',
    ]);
  });

  it('brak propozycji dla treningu bez planu i dla szablonu', () => {
    const { db } = setup();
    const empty = startSession(db, { kind: 'empty' }, T0);
    finishSession(db, empty, {}, at(600));
    expect(proposePlanUpdate(db, empty)).toBeNull();

    const template = db
      .select()
      .from(schema.workoutPlans)
      .where(eq(schema.workoutPlans.isTemplate, true))
      .get()!;
    const fromTemplate = startSession(db, { kind: 'plan', planId: template.id }, at(1000));
    finishSession(db, fromTemplate, {}, at(2000));
    expect(proposePlanUpdate(db, fromTemplate)).toBeNull();
  });

  it('dopasowuje po kolei ćwiczenie powtórzone w planie', () => {
    const { db, squat } = setup();
    const item = (key: string, weight: number) => ({
      key,
      exerciseId: squat.id,
      exerciseName: squat.name,
      trackingType: 'REPS' as const,
      targetSets: 1,
      targetReps: 5,
      targetWeight: weight,
      targetDurationSeconds: null,
      restDurationSeconds: 60,
      notes: null,
    });
    const planId = savePlan(db, {
      title: 'Dwa razy przysiad',
      description: '',
      sourceTemplateId: null,
      items: [item('a', 50), item('b', 70)],
    });

    const id = startSession(db, { kind: 'plan', planId }, T0);
    const [first, second] = loadSession(db, id)!.exercises;
    completeSet(db, first.sets[0].id, { repsCompleted: 5, weightKg: 55 }, at(60));
    completeSet(db, second.sets[0].id, { repsCompleted: 5, weightKg: 75 }, at(180));
    finishSession(db, id, {}, at(900));

    const changes = proposePlanUpdate(db, id)!.changes;
    expect(changes.map((c) => [c.from, c.to])).toEqual([
      [50, 55],
      [70, 75],
    ]);
    applyPlanUpdate(db, changes);
    expect(loadPlanDraft(db, planId).items.map((i) => i.targetWeight)).toEqual([55, 75]);
  });
});
