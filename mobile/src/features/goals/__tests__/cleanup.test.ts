/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { scheduleWorkouts } from '@/features/calendar/repository';
import { saveEndurancePlan } from '@/features/endurance/repository';
import { createSegment } from '@/features/endurance/draft';
import { finishSession, startSession } from '@/features/workout/repository';

import { findJunk, plannerMade, sweepJunk } from '../cleanup';
import { materializeGoal, savePlan, saveGoal } from '../repository';
import { planGoal, type GoalBrief } from '../planner';
import { KIND_NOTES } from '../shapes';

const GOAL = {
  sport: 'RUNNING' as const,
  title: 'XX Zadyszka',
  eventDate: '2027-04-15',
  distanceMeters: 10000,
  targetSeconds: 40 * 60,
  weekDays: [1, 3, 5],
  notes: null,
};

const BRIEF: GoalBrief = {
  sport: 'RUNNING',
  title: GOAL.title,
  distanceMeters: GOAL.distanceMeters,
  eventDate: GOAL.eventDate,
  targetSeconds: GOAL.targetSeconds,
  weekDays: GOAL.weekDays,
  weeklyMeters: 25000,
  bestPaceSeconds: 290,
  age: 41,
};

const FROM = '2026-10-12';

type Db = ReturnType<typeof createTestDb>;

/** Cel z planem wpisanym do kalendarza. */
function materialized(db: Db): number {
  const goalId = saveGoal(db, GOAL);
  savePlan(db, goalId, planGoal(BRIEF, FROM), 'RULES');
  materializeGoal(db, goalId, { scheduledTime: null, reminderOffsetMinutes: null, from: FROM });
  return goalId;
}

/** Plan ułożony ręcznie — to on nie ma prawa wpaść pod sprzątanie. */
function ownPlan(db: Db, title: string): number {
  return saveEndurancePlan(db, {
    sport: 'RUNNING',
    title,
    description: 'Mój własny opis.',
    segments: [{ ...createSegment('WORK'), durationType: 'DISTANCE', distanceMeters: 5000 }],
  });
}

describe('plannerMade', () => {
  it('poznaje plan planisty po jego stałej notatce', () => {
    expect(plannerMade(KIND_NOTES.LONG)).toBe(true);
    expect(plannerMade(KIND_NOTES.RACE)).toBe(true);
  });

  it('nie bierze planu ułożonego ręcznie', () => {
    expect(plannerMade('Mój własny opis.')).toBe(false);
    expect(plannerMade(null)).toBe(false);
    expect(plannerMade('')).toBe(false);
  });
});

describe('sprzątanie po celu', () => {
  it('przy celu, który stoi, nie ma czego sprzątać', () => {
    const db = createTestDb({ seed: true });
    materialized(db);
    expect(findJunk(db, FROM)).toEqual({ terms: 0, plans: 0 });
  });

  it('po usunięciu celu znikają jego terminy i plany jednostek', () => {
    const db = createTestDb({ seed: true });
    const goalId = materialized(db);
    const before = db.select().from(schema.scheduledWorkouts).all().length;

    // Usunięcie wprost w bazie: tak wyglądał stan po celu skasowanym starszą wersją aplikacji.
    db.delete(schema.trainingGoals).where(eq(schema.trainingGoals.id, goalId)).run();

    const junk = findJunk(db, FROM);
    expect(junk.terms).toBe(before);
    expect(junk.plans).toBeGreaterThan(before - 1);

    expect(sweepJunk(db, FROM)).toEqual(junk);
    expect(db.select().from(schema.scheduledWorkouts).all()).toEqual([]);
    expect(findJunk(db, FROM)).toEqual({ terms: 0, plans: 0 });
  });

  it('nie rusza planów i terminów ułożonych ręcznie', () => {
    const db = createTestDb({ seed: true });
    const planId = ownPlan(db, 'Mój wtorek');
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-13', '2026-10-20'],
      scheduledTime: '18:00',
      reminderOffsetMinutes: null,
    });

    expect(findJunk(db, FROM)).toEqual({ terms: 0, plans: 0 });
    sweepJunk(db, FROM);
    expect(db.select().from(schema.scheduledWorkouts).all()).toHaveLength(2);
    expect(db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).all()).toHaveLength(1);
  });

  it('nie rusza przeszłości ani terminu z przeprowadzonym treningiem', () => {
    const db = createTestDb({ seed: true });
    const goalId = materialized(db);
    const terms = db.select().from(schema.scheduledWorkouts).all();
    const done = terms[0];
    finishSession(db, startSession(db, { kind: 'scheduled', scheduledId: done.id }));
    db.delete(schema.trainingGoals).where(eq(schema.trainingGoals.id, goalId)).run();

    // „Dziś” dwa tygodnie później: wcześniejsze terminy to już historia kalendarza.
    sweepJunk(db, '2026-10-26');

    const left = db.select().from(schema.scheduledWorkouts).all();
    expect(left.some((row) => row.id === done.id)).toBe(true);
    expect(left.every((row) => row.scheduledDate < '2026-10-26' || row.id === done.id)).toBe(true);
  });

  it('plan, który wciąż ma termin w przeszłości, zostaje', () => {
    const db = createTestDb({ seed: true });
    const goalId = materialized(db);
    db.delete(schema.trainingGoals).where(eq(schema.trainingGoals.id, goalId)).run();

    sweepJunk(db, '2026-10-26');

    // Plany jednostek z przeszłości muszą zostać — inaczej zabrałyby ze sobą swoje terminy.
    const plans = db.select().from(schema.workoutPlans).all();
    const withTerms = db.select().from(schema.scheduledWorkouts).all().map((row) => row.planId);
    expect(withTerms.every((id) => plans.some((plan) => plan.id === id))).toBe(true);
  });
});
