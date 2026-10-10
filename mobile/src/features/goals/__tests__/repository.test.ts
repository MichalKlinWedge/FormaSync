/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { listScheduled } from '@/features/calendar/repository';
import { loadEnduranceDraft } from '@/features/endurance/repository';
import { finishSession, startSession } from '@/features/workout/repository';

import { parseWeekDays, serializeWeekDays } from '../brief';
import { planGoal, type GoalBrief } from '../planner';
import {
  activeGoal,
  deleteGoal,
  goalPlan,
  goalProgress,
  GoalValidationError,
  listGoals,
  loadGoal,
  materializeGoal,
  saveGoal,
  savePlan,
  setGoalStatus,
} from '../repository';

const GOAL = {
  sport: 'RUNNING' as const,
  title: 'Półmaraton Wrocław',
  eventDate: '2027-02-07',
  distanceMeters: 21097,
  targetSeconds: 105 * 60,
  weekDays: [1, 3, 5, 6],
  notes: null,
};

const BRIEF: GoalBrief = {
  sport: 'RUNNING',
  title: GOAL.title,
  distanceMeters: GOAL.distanceMeters,
  eventDate: GOAL.eventDate,
  targetSeconds: GOAL.targetSeconds,
  weekDays: GOAL.weekDays,
  weeklyMeters: 30000,
  bestPaceSeconds: 290,
  age: 41,
};

const FROM = '2026-10-12';

/** Cel z zapisanym planem — stan, od którego zaczyna się wpisywanie do kalendarza. */
function planned(db: ReturnType<typeof createTestDb>) {
  const goalId = saveGoal(db, GOAL);
  savePlan(db, goalId, planGoal(BRIEF, FROM), 'RULES');
  return goalId;
}

describe('dni tygodnia', () => {
  it('wracają z zapisu w tej samej postaci', () => {
    expect(parseWeekDays(serializeWeekDays([6, 1, 3]))).toEqual([1, 3, 6]);
  });

  it('odrzuca to, co nie jest dniem tygodnia', () => {
    expect(parseWeekDays('1 9 -2 x 3 3')).toEqual([1, 3]);
  });
});

describe('saveGoal', () => {
  it('zapisuje cel i oddaje go z bazy', () => {
    const db = createTestDb({ seed: true });
    const id = saveGoal(db, GOAL);

    expect(loadGoal(db, id)).toMatchObject({
      title: 'Półmaraton Wrocław',
      eventDate: '2027-02-07',
      weekDays: '1 3 5 6',
      status: 'ACTIVE',
      plannedBy: null,
    });
  });

  it('nie przyjmuje celu bez nazwy, dystansu, daty ani dni', () => {
    const db = createTestDb({ seed: true });
    expect(() => saveGoal(db, { ...GOAL, title: '  ' })).toThrow(GoalValidationError);
    expect(() => saveGoal(db, { ...GOAL, distanceMeters: 0 })).toThrow(GoalValidationError);
    expect(() => saveGoal(db, { ...GOAL, eventDate: 'luty' })).toThrow(GoalValidationError);
    expect(() => saveGoal(db, { ...GOAL, weekDays: [] })).toThrow(GoalValidationError);
  });

  it('poprawia istniejący cel, a nie zakłada drugiego', () => {
    const db = createTestDb({ seed: true });
    const id = saveGoal(db, GOAL);
    saveGoal(db, { ...GOAL, id, targetSeconds: 100 * 60 });

    expect(listGoals(db)).toHaveLength(1);
    expect(loadGoal(db, id)?.targetSeconds).toBe(6000);
  });
});

describe('savePlan', () => {
  it('zapisuje cały plan i oznacza, czym go ułożono', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);

    const workouts = goalPlan(db, goalId);
    expect(workouts.length).toBeGreaterThan(50);
    expect(loadGoal(db, goalId)?.plannedBy).toBe('RULES');
    // Jednostki wracają po dacie, więc zawody są ostatnie.
    expect(workouts.at(-1)).toMatchObject({ kind: 'RACE', plannedDate: GOAL.eventDate });
  });

  it('przeliczenie zastępuje poprzedni plan, a nie dokłada drugiego', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    const before = goalPlan(db, goalId).length;

    savePlan(db, goalId, planGoal(BRIEF, FROM), 'RULES');
    expect(goalPlan(db, goalId)).toHaveLength(before);
  });

  it('nie rusza jednostek już wpisanych do kalendarza', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    materializeGoal(db, goalId, { scheduledTime: null, reminderOffsetMinutes: null, from: FROM });
    const scheduled = goalPlan(db, goalId).filter((workout) => workout.scheduledId !== null);

    savePlan(db, goalId, [], 'GEMINI');
    const left = goalPlan(db, goalId);
    // Pusty plan wymiótłby wszystko, gdyby nie ochrona wpisanych terminów.
    expect(left).toHaveLength(scheduled.length);
    expect(left.every((workout) => workout.scheduledId !== null)).toBe(true);
  });
});

describe('materializeGoal', () => {
  it('z każdej jednostki robi plan z odcinkami i termin w kalendarzu', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    const written = materializeGoal(db, goalId, {
      scheduledTime: '07:00',
      reminderOffsetMinutes: 30,
      from: FROM,
    });

    expect(written).toBeGreaterThan(50);
    const terms = listScheduled(db, FROM, GOAL.eventDate, FROM);
    expect(terms.length).toBe(written);
    expect(terms[0]).toMatchObject({ scheduledTime: '07:00' });
  });

  it('plan jednostki interwałowej ma grupę powtórzeń', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    materializeGoal(db, goalId, { scheduledTime: null, reminderOffsetMinutes: null, from: FROM });

    const intervals = goalPlan(db, goalId).find((workout) => workout.kind === 'INTERVALS');
    expect(intervals?.planId).not.toBeNull();
    const draft = loadEnduranceDraft(db, intervals!.planId!);
    expect(draft.segments.some((segment) => segment.kind === 'REPEAT')).toBe(true);
  });

  it('nie wpisuje przeszłości', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    // Dwa tygodnie później: wcześniejsze jednostki są już nie do zrobienia.
    materializeGoal(db, goalId, {
      scheduledTime: null,
      reminderOffsetMinutes: null,
      from: '2026-10-26',
    });

    const written = goalPlan(db, goalId).filter((workout) => workout.scheduledId !== null);
    expect(written.every((workout) => workout.plannedDate >= '2026-10-26')).toBe(true);
    expect(written.length).toBeLessThan(goalPlan(db, goalId).length);
  });

  it('powtórne wpisanie nie tworzy duplikatów', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    const options = { scheduledTime: null, reminderOffsetMinutes: null, from: FROM };
    const first = materializeGoal(db, goalId, options);

    expect(materializeGoal(db, goalId, options)).toBe(0);
    expect(listScheduled(db, FROM, GOAL.eventDate, FROM)).toHaveLength(first);
  });
});

describe('goalProgress', () => {
  it('liczy dowiezione z sesji dopiętych do terminów celu', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    materializeGoal(db, goalId, { scheduledTime: null, reminderOffsetMinutes: null, from: FROM });

    const first = goalPlan(db, goalId).find((workout) => workout.scheduledId !== null)!;
    const sessionId = startSession(db, { kind: 'scheduled', scheduledId: first.scheduledId! });
    finishSession(db, sessionId);

    const progress = goalProgress(db, goalId);
    expect(progress.done).toBe(1);
    expect(progress.scheduled).toBe(progress.planned);
    expect(progress.plannedMeters).toBeGreaterThan(0);
  });

  it('bez planu nie wymyśla postępu', () => {
    const db = createTestDb({ seed: true });
    const goalId = saveGoal(db, GOAL);
    expect(goalProgress(db, goalId)).toMatchObject({ planned: 0, scheduled: 0, done: 0 });
  });
});

describe('activeGoal', () => {
  it('bierze najbliższy cel w toku', () => {
    const db = createTestDb({ seed: true });
    saveGoal(db, { ...GOAL, title: 'Maraton', eventDate: '2027-05-01' });
    const near = saveGoal(db, GOAL);

    expect(activeGoal(db, FROM)?.id).toBe(near);
  });

  it('pomija cele po terminie i porzucone', () => {
    const db = createTestDb({ seed: true });
    const id = saveGoal(db, GOAL);
    expect(activeGoal(db, '2027-03-01')).toBeNull();

    setGoalStatus(db, id, 'ABANDONED');
    expect(activeGoal(db, FROM)).toBeNull();
  });
});

describe('deleteGoal', () => {
  it('usuwa cel razem z planem, ale zostawia wpisane terminy', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    materializeGoal(db, goalId, { scheduledTime: null, reminderOffsetMinutes: null, from: FROM });
    const terms = db.select().from(schema.scheduledWorkouts).all().length;

    deleteGoal(db, goalId);

    expect(loadGoal(db, goalId)).toBeNull();
    expect(db.select().from(schema.goalWorkouts).where(eq(schema.goalWorkouts.goalId, goalId)).all()).toEqual([]);
    // Terminy zostają: trening, który się odbył, nie może zniknąć z historii kalendarza.
    expect(db.select().from(schema.scheduledWorkouts).all()).toHaveLength(terms);
  });
});
