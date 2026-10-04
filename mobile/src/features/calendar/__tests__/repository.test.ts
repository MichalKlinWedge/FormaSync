/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { savePlan } from '@/features/plans/repository';
import { completeSet, finishSession, loadSession, startSession } from '@/features/workout/repository';
import { generateRecurringDates } from '@/lib/date';

import {
  deleteScheduled,
  listPendingReminders,
  listScheduled,
  loadScheduled,
  reminderDate,
  scheduleStatus,
  scheduleWorkouts,
} from '../repository';

function setup() {
  const db = createTestDb({ seed: true });
  const squat = db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.name, 'Przysiad ze sztangą'))
    .get()!;
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
        targetSets: 1,
        targetReps: 5,
        targetWeight: 60,
        targetDurationSeconds: null,
        restDurationSeconds: 60,
        notes: null,
      },
    ],
  });
  return { db, planId };
}

describe('scheduleStatus', () => {
  it('rozróżnia zaplanowany, pominięty i wykonany', () => {
    const today = '2026-10-05';
    expect(scheduleStatus({ scheduledDate: '2026-10-06', isCompleted: false }, today)).toBe('PLANNED');
    expect(scheduleStatus({ scheduledDate: '2026-10-05', isCompleted: false }, today)).toBe('PLANNED');
    expect(scheduleStatus({ scheduledDate: '2026-10-04', isCompleted: false }, today)).toBe('MISSED');
    expect(scheduleStatus({ scheduledDate: '2026-10-01', isCompleted: true }, today)).toBe('COMPLETED');
  });
});

describe('reminderDate', () => {
  it('odejmuje wyprzedzenie od zaplanowanej godziny', () => {
    const when = reminderDate({
      scheduledDate: '2026-10-05',
      scheduledTime: '18:00',
      reminderOffsetMinutes: 30,
    });
    expect(when.getHours()).toBe(17);
    expect(when.getMinutes()).toBe(30);
  });

  it('bez godziny przyjmuje południe, bez wyprzedzenia nie przesuwa', () => {
    const when = reminderDate({ scheduledDate: '2026-10-05', scheduledTime: null, reminderOffsetMinutes: null });
    expect(when.getHours()).toBe(12);
    expect(when.getMinutes()).toBe(0);
  });
});

describe('scheduleWorkouts', () => {
  it('zapisuje terminy jednorazowe i cykliczne', () => {
    const { db, planId } = setup();
    const dates = generateRecurringDates('2026-10-01', [0, 2, 4], 2);

    expect(scheduleWorkouts(db, { planId, dates, scheduledTime: '18:00', reminderOffsetMinutes: 60 })).toBe(6);

    const entries = listScheduled(db, '2026-10-01', '2026-10-31', '2026-10-01');
    expect(entries).toHaveLength(6);
    expect(entries[0]).toMatchObject({
      planTitle: 'Mój plan',
      scheduledDate: '2026-10-02',
      scheduledTime: '18:00',
      reminderOffsetMinutes: 60,
      status: 'PLANNED',
      sessionId: null,
    });
  });

  it('wczytuje pojedynczy termin na potrzeby ekranu szczegółów', () => {
    const { db, planId } = setup();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-02'],
      scheduledTime: '18:00',
      reminderOffsetMinutes: null,
    });
    const [entry] = listScheduled(db, '2026-10-01', '2026-10-31', '2026-10-01');
    expect(loadScheduled(db, entry.id, '2026-10-01')).toEqual(entry);
    expect(loadScheduled(db, 9999, '2026-10-01')).toBeNull();
  });

  it('wczytuje pojedynczy termin razem z przeprowadzonym treningiem', () => {
    const { db, planId } = setup();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-02'],
      scheduledTime: '18:00',
      reminderOffsetMinutes: null,
    });
    const [entry] = listScheduled(db, '2026-10-01', '2026-10-31', '2026-10-01');
    const sessionId = startSession(db, { kind: 'scheduled', scheduledId: entry.id });
    finishSession(db, sessionId);

    expect(loadScheduled(db, entry.id, '2026-10-01')).toMatchObject({ sessionId, status: 'COMPLETED' });
  });

  it('wskazuje trening przeprowadzony z terminu, żeby dało się wejść w jego szczegóły', () => {
    const { db, planId } = setup();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-02'],
      scheduledTime: '18:00',
      reminderOffsetMinutes: null,
    });
    const [entry] = listScheduled(db, '2026-10-01', '2026-10-31', '2026-10-01');
    const sessionId = startSession(db, { kind: 'scheduled', scheduledId: entry.id });
    finishSession(db, sessionId);

    const [after] = listScheduled(db, '2026-10-01', '2026-10-31', '2026-10-01');
    expect(after).toMatchObject({ status: 'COMPLETED', sessionId });
  });

  it('nie tworzy duplikatu dla tego samego planu i dnia', () => {
    const { db, planId } = setup();
    scheduleWorkouts(db, { planId, dates: ['2026-10-05'], scheduledTime: null, reminderOffsetMinutes: null });
    const added = scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-05', '2026-10-06'],
      scheduledTime: null,
      reminderOffsetMinutes: null,
    });
    expect(added).toBe(1);
    expect(listScheduled(db, '2026-10-01', '2026-10-31')).toHaveLength(2);
  });

  it('ogranicza listę do podanego zakresu dat', () => {
    const { db, planId } = setup();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-09-30', '2026-10-15', '2026-11-01'],
      scheduledTime: null,
      reminderOffsetMinutes: null,
    });
    expect(listScheduled(db, '2026-10-01', '2026-10-31').map((e) => e.scheduledDate)).toEqual(['2026-10-15']);
  });
});

describe('powiązanie z treningiem', () => {
  it('ukończony trening oznacza termin jako zrealizowany', () => {
    const { db, planId } = setup();
    scheduleWorkouts(db, { planId, dates: ['2026-10-05'], scheduledTime: '18:00', reminderOffsetMinutes: 30 });
    const scheduled = listScheduled(db, '2026-10-05', '2026-10-05', '2026-10-05')[0];

    const sessionId = startSession(db, { kind: 'scheduled', scheduledId: scheduled.id }, '2026-10-05T18:00:00.000Z');
    const set = loadSession(db, sessionId)!.exercises[0].sets[0];
    completeSet(db, set.id, { repsCompleted: 5, weightKg: 60 }, '2026-10-05T18:05:00.000Z');
    finishSession(db, sessionId, {}, '2026-10-05T19:00:00.000Z');

    expect(listScheduled(db, '2026-10-05', '2026-10-05', '2026-10-06')[0].status).toBe('COMPLETED');
  });

  it('usunięcie planu usuwa jego terminy', () => {
    const { db, planId } = setup();
    scheduleWorkouts(db, { planId, dates: ['2026-10-05'], scheduledTime: null, reminderOffsetMinutes: null });
    db.delete(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).run();
    expect(listScheduled(db, '2026-01-01', '2026-12-31')).toEqual([]);
  });

  it('usuwa pojedynczy termin', () => {
    const { db, planId } = setup();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-05', '2026-10-07'],
      scheduledTime: null,
      reminderOffsetMinutes: null,
    });
    const [first] = listScheduled(db, '2026-10-01', '2026-10-31');
    deleteScheduled(db, first.id);
    expect(listScheduled(db, '2026-10-01', '2026-10-31').map((e) => e.scheduledDate)).toEqual(['2026-10-07']);
  });
});

describe('listPendingReminders', () => {
  it('pomija terminy przeszłe i zrealizowane', () => {
    const { db, planId } = setup();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-01', '2026-10-10'],
      scheduledTime: '18:00',
      reminderOffsetMinutes: 60,
    });
    const done = listScheduled(db, '2026-10-10', '2026-10-10')[0];
    db.update(schema.scheduledWorkouts)
      .set({ isCompleted: true })
      .where(eq(schema.scheduledWorkouts.id, done.id))
      .run();

    // Punkt odniesienia: 5 października, więc termin z 1 października już minął.
    const pending = listPendingReminders(db, new Date(2026, 9, 5, 12, 0));
    expect(pending).toEqual([]);

    scheduleWorkouts(db, { planId, dates: ['2026-10-20'], scheduledTime: '07:30', reminderOffsetMinutes: 15 });
    const next = listPendingReminders(db, new Date(2026, 9, 5, 12, 0));
    expect(next).toHaveLength(1);
    expect(next[0].remindAt.getHours()).toBe(7);
    expect(next[0].remindAt.getMinutes()).toBe(15);
  });
});
