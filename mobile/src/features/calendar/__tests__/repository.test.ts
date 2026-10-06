/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { Sport } from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { savePlan } from '@/features/plans/repository';
import { listHistory } from '@/features/history/repository';
import { completeSet, finishSession, loadSession, startSession } from '@/features/workout/repository';
import { generateRecurringDates } from '@/lib/date';

import {
  deleteScheduled,
  listPendingReminders,
  attachSession,
  detachSession,
  listScheduled,
  loadScheduled,
  openTermsOn,
  sessionsToAttach,
  reminderDate,
  scheduleStatus,
  clearGarminSchedule,
  ScheduleConflictError,
  scheduleWorkouts,
  setGarminSchedule,
  updateScheduled,
} from '../repository';

function setup() {
  const db = createTestDb({ seed: true });
  const squat = db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.name, 'Przysiad ze sztangą'))
    .get()!;
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
      sport: 'STRENGTH',
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

describe('przypisywanie treningu do terminu', () => {
  /** Zakończony trening bez terminu — taki, który da się przypisać. */
  const addSession = (
    db: ReturnType<typeof createTestDb>,
    title: string,
    startTime: string,
    sport: Sport = 'STRENGTH',
  ) =>
    db
      .insert(schema.workoutSessions)
      .values({ title, sport, status: 'COMPLETED', startTime, endTime: startTime })
      .returning({ id: schema.workoutSessions.id })
      .get().id;

  function withTerm() {
    const { db, planId } = setup();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-02'],
      scheduledTime: '18:00',
      reminderOffsetMinutes: null,
    });
    const [term] = listScheduled(db, '2026-10-01', '2026-10-31', '2026-10-01');
    return { db, term };
  }

  it('proponuje treningi z okolic daty terminu, od najbliższego', () => {
    const { db, term } = withTerm();
    addSession(db, 'Daleki', '2026-10-04T10:00:00.000Z');
    addSession(db, 'Bliski', '2026-10-02T10:00:00.000Z');
    expect(sessionsToAttach(db, term.scheduledDate, term.sport).map((s) => s.title)).toEqual(['Bliski', 'Daleki']);
  });

  it('nie proponuje treningu z innej dyscypliny', () => {
    // Termin siłowy nie ma nic wspólnego z przepłyniętymi kilometrami; podstawienie go
    // oznaczyłoby termin jako wykonany cudzym treningiem.
    const { db, term } = withTerm();
    addSession(db, 'Basen', '2026-10-02T10:00:00.000Z', 'SWIMMING');
    addSession(db, 'Nogi', '2026-10-02T11:00:00.000Z', 'STRENGTH');
    expect(sessionsToAttach(db, term.scheduledDate, term.sport).map((s) => s.title)).toEqual(['Nogi']);
  });

  it('pomija treningi spoza okna i już przypisane do innego terminu', () => {
    const { db, term } = withTerm();
    addSession(db, 'Za stary', '2026-09-01T10:00:00.000Z');
    const zajety = addSession(db, 'Zajęty', '2026-10-02T10:00:00.000Z');
    attachSession(db, term.id, zajety);
    expect(sessionsToAttach(db, term.scheduledDate, term.sport)).toEqual([]);
  });

  it('wolne terminy dnia dotyczą tylko tej dyscypliny', () => {
    const { db, term } = withTerm();
    expect(openTermsOn(db, '2026-10-02', 'STRENGTH').map((t) => t.id)).toEqual([term.id]);
    expect(openTermsOn(db, '2026-10-02', 'SWIMMING')).toEqual([]);
    expect(openTermsOn(db, '2026-10-03', 'STRENGTH')).toEqual([]);
  });

  it('termin z już przypisanym treningiem nie jest wolny', () => {
    const { db, term } = withTerm();
    attachSession(db, term.id, addSession(db, 'Nogi', '2026-10-02T10:00:00.000Z'));
    expect(openTermsOn(db, '2026-10-02', 'STRENGTH')).toEqual([]);
  });

  it('przypisanie ukończonego treningu oznacza termin jako wykonany', () => {
    const { db, term } = withTerm();
    const sessionId = addSession(db, 'Nogi', '2026-10-02T10:00:00.000Z');

    attachSession(db, term.id, sessionId);

    expect(loadScheduled(db, term.id, '2026-10-05')).toMatchObject({
      sessionId,
      isCompleted: true,
      status: 'COMPLETED',
    });
  });

  it('przerwany trening przypisujemy, ale terminu nie uznajemy za wykonany', () => {
    const { db, term } = withTerm();
    const sessionId = db
      .insert(schema.workoutSessions)
      .values({
        title: 'Przerwany',
        status: 'ABANDONED',
        startTime: '2026-10-02T10:00:00.000Z',
        endTime: '2026-10-02T10:05:00.000Z',
      })
      .returning({ id: schema.workoutSessions.id })
      .get().id;

    attachSession(db, term.id, sessionId);

    expect(loadScheduled(db, term.id, '2026-10-05')).toMatchObject({
      sessionId,
      isCompleted: false,
      status: 'MISSED',
    });
  });

  it('odpięcie zostawia trening w historii i cofa termin do niewykonanych', () => {
    const { db, term } = withTerm();
    const sessionId = addSession(db, 'Nogi', '2026-10-02T10:00:00.000Z');
    attachSession(db, term.id, sessionId);

    detachSession(db, sessionId);

    expect(loadScheduled(db, term.id, '2026-10-05')).toMatchObject({
      sessionId: null,
      isCompleted: false,
    });
    expect(listHistory(db).map((entry) => entry.id)).toContain(sessionId);
  });
});

describe('updateScheduled', () => {
  function withTermToMove() {
    const { db, planId } = setup();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-06'],
      scheduledTime: '18:00',
      reminderOffsetMinutes: 60,
    });
    const term = db.select().from(schema.scheduledWorkouts).get()!;
    return { db, planId, term };
  }

  it('przesuwa termin na inny dzień', () => {
    const { db, term } = withTermToMove();

    updateScheduled(db, term.id, {
      scheduledDate: '2026-10-08',
      scheduledTime: '18:00',
      reminderOffsetMinutes: 60,
    });

    expect(loadScheduled(db, term.id, '2026-10-05')).toMatchObject({
      scheduledDate: '2026-10-08',
      scheduledTime: '18:00',
    });
  });

  it('zmienia godzinę i przypomnienie', () => {
    const { db, term } = withTermToMove();

    updateScheduled(db, term.id, {
      scheduledDate: '2026-10-06',
      scheduledTime: '07:30',
      reminderOffsetMinutes: 15,
    });

    expect(loadScheduled(db, term.id, '2026-10-05')).toMatchObject({
      scheduledTime: '07:30',
      reminderOffsetMinutes: 15,
    });
  });

  it('termin całodniowy traci godzinę', () => {
    const { db, term } = withTermToMove();

    updateScheduled(db, term.id, {
      scheduledDate: '2026-10-06',
      scheduledTime: null,
      reminderOffsetMinutes: null,
    });

    expect(loadScheduled(db, term.id, '2026-10-05')?.scheduledTime).toBeNull();
  });

  it('stare przypomnienie przestaje obowiązywać po przesunięciu', () => {
    const { db, term } = withTermToMove();
    db.update(schema.scheduledWorkouts)
      .set({ notificationId: 'stare-powiadomienie' })
      .where(eq(schema.scheduledWorkouts.id, term.id))
      .run();

    updateScheduled(db, term.id, {
      scheduledDate: '2026-10-09',
      scheduledTime: '18:00',
      reminderOffsetMinutes: 60,
    });

    // Identyfikator musi zniknąć, inaczej przypomnienie zostałoby na dawną porę.
    expect(
      db.select().from(schema.scheduledWorkouts).where(eq(schema.scheduledWorkouts.id, term.id)).get()
        ?.notificationId,
    ).toBeNull();
  });

  it('nie zlewa dwóch terminów tego samego planu w jeden dzień', () => {
    const { db, planId, term } = withTermToMove();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-07'],
      scheduledTime: '18:00',
      reminderOffsetMinutes: 60,
    });

    expect(() =>
      updateScheduled(db, term.id, {
        scheduledDate: '2026-10-07',
        scheduledTime: '18:00',
        reminderOffsetMinutes: 60,
      }),
    ).toThrow(ScheduleConflictError);

    expect(loadScheduled(db, term.id, '2026-10-05')?.scheduledDate).toBe('2026-10-06');
  });

  it('zapis bez zmiany dnia nie jest konfliktem sam ze sobą', () => {
    const { db, term } = withTermToMove();

    expect(() =>
      updateScheduled(db, term.id, {
        scheduledDate: '2026-10-06',
        scheduledTime: '19:00',
        reminderOffsetMinutes: 60,
      }),
    ).not.toThrow();
  });
});

describe('ślad po kalendarzu Garmina', () => {
  function withTerm() {
    const { db, planId } = setup();
    scheduleWorkouts(db, {
      planId,
      dates: ['2026-10-08'],
      scheduledTime: '18:00',
      reminderOffsetMinutes: 60,
    });
    return { db, term: db.select().from(schema.scheduledWorkouts).get()! };
  }

  it('zapisuje identyfikatory wpisu i treningu', () => {
    const { db, term } = withTerm();

    setGarminSchedule(db, term.id, { workoutId: 1716637940, scheduleId: 42 });

    const row = db
      .select()
      .from(schema.scheduledWorkouts)
      .where(eq(schema.scheduledWorkouts.id, term.id))
      .get()!;
    expect(row).toMatchObject({
      garminSynced: true,
      garminWorkoutId: '1716637940',
      garminScheduleId: '42',
    });
    expect(loadScheduled(db, term.id, '2026-10-05')?.garminScheduleId).toBe('42');
  });

  it('zdjęcie z kalendarza czyści ślad, ale zostawia trening w bibliotece', () => {
    const { db, term } = withTerm();
    setGarminSchedule(db, term.id, { workoutId: 123, scheduleId: 42 });

    clearGarminSchedule(db, term.id);

    const row = db
      .select()
      .from(schema.scheduledWorkouts)
      .where(eq(schema.scheduledWorkouts.id, term.id))
      .get()!;
    expect(row).toMatchObject({ garminSynced: false, garminScheduleId: null });
    // Identyfikator treningu zostaje: trening nadal jest w bibliotece Garmina.
    expect(row.garminWorkoutId).toBe('123');
  });

  it('przeniesienie na inny dzień unieważnia wpis w kalendarzu Garmina', () => {
    const { db, term } = withTerm();
    setGarminSchedule(db, term.id, { workoutId: 123, scheduleId: 42 });

    const previous = updateScheduled(db, term.id, {
      scheduledDate: '2026-10-09',
      scheduledTime: '18:00',
      reminderOffsetMinutes: 60,
    });

    // Wpis u Garmina dotyczy starej daty — nie wolno udawać, że przeniesiony termin tam stoi.
    expect(loadScheduled(db, term.id, '2026-10-05')?.garminScheduleId).toBeNull();
    // Poprzedni dzień wraca, bo bez niego nie dałoby się zdjąć starego wpisu u Garmina.
    expect(previous).toBe(term.scheduledDate);
  });

  it('sama zmiana godziny zostawia wpis u Garmina w spokoju', () => {
    // Kalendarz Garmina zna tylko dzień, więc przesunięcie godziny niczego tam nie zmienia.
    // Zdjęcie śladu kazałoby wpisywać termin od nowa bez żadnego powodu.
    const { db, term } = withTerm();
    setGarminSchedule(db, term.id, { workoutId: 123, scheduleId: 42 });

    const previous = updateScheduled(db, term.id, {
      scheduledDate: term.scheduledDate,
      scheduledTime: '07:30',
      reminderOffsetMinutes: null,
    });

    expect(previous).toBe(term.scheduledDate);
    expect(loadScheduled(db, term.id, '2026-10-05')?.garminScheduleId).toBe('42');
  });
});
