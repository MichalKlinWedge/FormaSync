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
import { fromDateKey } from '@/lib/date';

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
  moveGoalDays,
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

describe('moveGoalDays', () => {
  /** Dni, w które wypadają jednostki planu; 0 = poniedziałek. */
  const daysUsed = (db: ReturnType<typeof createTestDb>, goalId: number): number[] =>
    [
      ...new Set(
        goalPlan(db, goalId)
          .filter((workout) => workout.kind !== 'RACE' && workout.plannedDate >= FROM)
          .map((workout) => (fromDateKey(workout.plannedDate).getDay() + 6) % 7),
      ),
    ].sort((a, b) => a - b);

  it('przestawia cały plan na inne dni', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    expect(daysUsed(db, goalId)).toEqual([1, 3, 5, 6]);

    const shift = moveGoalDays(db, goalId, [0, 2, 4, 5], FROM);

    expect(shift.moved).toBeGreaterThan(50);
    expect(shift.frozen).toBe(0);
    expect(daysUsed(db, goalId)).toEqual([0, 2, 4, 5]);
  });

  it('zapamiętuje nowe dni na celu, żeby przeliczenie planu do starych nie wróciło', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    moveGoalDays(db, goalId, [0, 2, 4], FROM);
    expect(parseWeekDays(loadGoal(db, goalId)!.weekDays)).toEqual([0, 2, 4]);
  });

  it('przesuwa też terminy już wpisane do kalendarza', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    materializeGoal(db, goalId, { scheduledTime: '07:00', reminderOffsetMinutes: 30, from: FROM });

    const shift = moveGoalDays(db, goalId, [0, 2, 4, 5], FROM);
    expect(shift.terms.length).toBe(shift.moved);

    // Termin ma iść za jednostką co do dnia, z zachowaną godziną i przypomnieniem.
    const workout = goalPlan(db, goalId).find((item) => item.scheduledId !== null)!;
    const term = listScheduled(db, FROM, GOAL.eventDate, FROM).find(
      (entry) => entry.id === workout.scheduledId,
    );
    expect(term).toMatchObject({
      scheduledDate: workout.plannedDate,
      scheduledTime: '07:00',
      reminderOffsetMinutes: 30,
    });
  });

  it('nie rusza przeszłości ani dnia zawodów', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    const before = goalPlan(db, goalId);
    const later = '2026-11-16';

    moveGoalDays(db, goalId, [0, 2, 4, 5], later);

    const after = new Map(goalPlan(db, goalId).map((workout) => [workout.id, workout.plannedDate]));
    const past = before.filter((workout) => workout.plannedDate < later);
    expect(past.length).toBeGreaterThan(10);
    expect(past.every((workout) => after.get(workout.id) === workout.plannedDate)).toBe(true);

    const race = before.find((workout) => workout.kind === 'RACE')!;
    expect(after.get(race.id)).toBe(GOAL.eventDate);
  });

  it('bez wybranego dnia odmawia, zamiast wyczyścić plan', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    expect(() => moveGoalDays(db, goalId, [], FROM)).toThrow(GoalValidationError);
  });

  it('powtórzone przesunięcie na te same dni niczego nie rusza', () => {
    const db = createTestDb({ seed: true });
    const goalId = planned(db);
    moveGoalDays(db, goalId, [0, 2, 4], FROM);
    expect(moveGoalDays(db, goalId, [0, 2, 4], FROM).moved).toBe(0);
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
