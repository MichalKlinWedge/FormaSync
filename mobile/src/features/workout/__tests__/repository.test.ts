/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { and, eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { savePlan } from '@/features/plans/repository';

import { countSets, restState, sessionTonnage } from '../logic';
import {
  abandonSession,
  ActiveSessionExistsError,
  addSessionExercise,
  addSet,
  completeSet,
  finishSession,
  findActiveSessionId,
  loadSession,
  reopenSet,
  startSession,
  swapSessionExercise,
  updateSet,
} from '../repository';

const T0 = '2026-10-01T10:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();
const ms = (seconds: number) => Date.parse(T0) + seconds * 1000;

function setup() {
  const db = createTestDb({ seed: true });
  const byName = (name: string) =>
    db.select().from(schema.exercises).where(eq(schema.exercises.name, name)).get()!;
  const squat = byName('Przysiad ze sztangą');
  const plank = byName('Plank (deska)');

  const planId = savePlan(db, {
    sport: 'STRENGTH',
    title: 'Testowy plan',
    description: '',
    sourceTemplateId: null,
    items: [
      {
        key: 'a',
        exerciseId: squat.id,
        exerciseName: squat.name,
        trackingType: 'REPS',
        targetSets: 3,
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
        targetSets: 2,
        targetReps: null,
        targetWeight: null,
        targetDurationSeconds: 45,
        restDurationSeconds: 60,
        notes: null,
      },
    ],
  });
  return { db, planId, squat, plank };
}

describe('startSession', () => {
  it('tworzy migawkę planu z zaplanowanymi seriami i podpowiedziami wartości', () => {
    const { db, planId } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const session = loadSession(db, id)!;

    expect(session.title).toBe('Testowy plan');
    expect(session.exercises.map((e) => e.name)).toEqual(['Przysiad ze sztangą', 'Plank (deska)']);
    expect(countSets(session.exercises)).toEqual({ completed: 0, planned: 5 });

    const [squat, plank] = session.exercises;
    expect(squat.sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
    expect(squat.sets[0]).toMatchObject({ repsCompleted: 8, weightKg: 60, completedAt: null });
    expect(plank.sets[0]).toMatchObject({ durationSeconds: 45, repsCompleted: null });
    expect(squat.restDurationSeconds).toBe(120);
  });

  it('dopuszcza tylko jedną trwającą sesję', () => {
    const { db, planId } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    expect(findActiveSessionId(db)).toBe(id);
    expect(() => startSession(db, { kind: 'plan', planId })).toThrow(ActiveSessionExistsError);
  });

  it('trening pusty startuje bez ćwiczeń, można je dodać w trakcie', () => {
    const { db, squat } = setup();
    const id = startSession(db, { kind: 'empty' }, T0);
    expect(loadSession(db, id)!.exercises).toEqual([]);

    addSessionExercise(db, id, squat.id);
    const session = loadSession(db, id)!;
    expect(session.title).toBe('Trening');
    expect(session.exercises[0].sets).toHaveLength(3);
  });

  it('sesja z harmonogramu wiąże się z terminem i planem', () => {
    const { db, planId } = setup();
    const scheduled = db
      .insert(schema.scheduledWorkouts)
      .values({ planId, scheduledDate: '2026-10-01' })
      .returning()
      .get();

    const id = startSession(db, { kind: 'scheduled', scheduledId: scheduled.id }, T0);
    expect(loadSession(db, id)).toMatchObject({ planId, scheduledId: scheduled.id });
  });
});

describe('rejestracja serii', () => {
  it('zapisuje poprawki i oznaczenie wykonania od razu w bazie', () => {
    const { db, planId } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const squat = loadSession(db, id)!.exercises[0];

    updateSet(db, squat.sets[0].id, { weightKg: 65 });
    completeSet(db, squat.sets[0].id, { repsCompleted: 7 }, at(60));

    const [saved] = loadSession(db, id)!.exercises;
    expect(saved.sets[0]).toMatchObject({ repsCompleted: 7, weightKg: 65, completedAt: at(60) });
    expect(sessionTonnage([saved])).toBe(7 * 65);
  });

  it('pozwala cofnąć oznaczenie serii', () => {
    const { db, planId } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const setId = loadSession(db, id)!.exercises[0].sets[0].id;

    completeSet(db, setId, {}, at(60));
    reopenSet(db, setId);
    expect(loadSession(db, id)!.exercises[0].sets[0].completedAt).toBeNull();
  });

  it('dodaje serię ponad plan, kopiując wartości z poprzedniej', () => {
    const { db, planId } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const squat = loadSession(db, id)!.exercises[0];
    completeSet(db, squat.sets[2].id, { repsCompleted: 6, weightKg: 70 }, at(300));

    addSet(db, squat.id);
    const sets = loadSession(db, id)!.exercises[0].sets;
    expect(sets).toHaveLength(4);
    expect(sets[3]).toMatchObject({ setNumber: 4, repsCompleted: 6, weightKg: 70, completedAt: null });
  });
});

describe('odporność na zamknięcie aplikacji', () => {
  it('odtwarza postęp i trwającą przerwę po ponownym wczytaniu sesji', () => {
    const { db, planId } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const squat = loadSession(db, id)!.exercises[0];
    completeSet(db, squat.sets[0].id, { repsCompleted: 8 }, at(100));

    // Nowe wczytanie = ponowne uruchomienie aplikacji: żaden stan nie żyje w pamięci.
    const resumed = loadSession(db, findActiveSessionId(db)!)!;
    expect(countSets(resumed.exercises)).toEqual({ completed: 1, planned: 5 });
    expect(restState(resumed.exercises, ms(130))).toMatchObject({ remainingSeconds: 90, totalSeconds: 120 });
    // Po czasie przerwy licznik nie wraca.
    expect(restState(resumed.exercises, ms(240))).toBeNull();
  });
});

describe('finishSession', () => {
  it('usuwa niewykonane serie, zapisuje czas i oznacza termin jako zrealizowany', () => {
    const { db, planId } = setup();
    const scheduled = db
      .insert(schema.scheduledWorkouts)
      .values({ planId, scheduledDate: '2026-10-01' })
      .returning()
      .get();
    const id = startSession(db, { kind: 'scheduled', scheduledId: scheduled.id }, T0);
    const squat = loadSession(db, id)!.exercises[0];
    completeSet(db, squat.sets[0].id, { repsCompleted: 8, weightKg: 60 }, at(60));
    completeSet(db, squat.sets[1].id, { repsCompleted: 8, weightKg: 60 }, at(200));

    finishSession(db, id, { userNotes: 'Lekko', rpeRating: 7 }, at(3600));

    const row = db.select().from(schema.workoutSessions).where(eq(schema.workoutSessions.id, id)).get()!;
    expect(row).toMatchObject({
      status: 'COMPLETED',
      totalDurationSeconds: 3600,
      userNotes: 'Lekko',
      rpeRating: 7,
    });
    expect(findActiveSessionId(db)).toBeNull();

    const session = loadSession(db, id)!;
    expect(countSets(session.exercises)).toEqual({ completed: 2, planned: 2 });
    // Plan pozostaje w migawce, więc nadal wiadomo, ile serii zaplanowano.
    expect(session.exercises[0].targetSets).toBe(3);
    expect(
      db.select().from(schema.scheduledWorkouts).where(eq(schema.scheduledWorkouts.id, scheduled.id)).get()
        ?.isCompleted,
    ).toBe(true);
  });

  it('edycja planu po treningu nie zmienia zapisanej historii', () => {
    const { db, planId, squat } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const sessionSquat = loadSession(db, id)!.exercises[0];
    completeSet(db, sessionSquat.sets[0].id, { repsCompleted: 8, weightKg: 60 }, at(60));
    finishSession(db, id, {}, at(1800));

    savePlan(db, {
      id: planId,
      sport: 'STRENGTH',
      title: 'Zmieniony plan',
      description: '',
      sourceTemplateId: null,
      items: [
        {
          key: 'x',
          exerciseId: squat.id,
          exerciseName: squat.name,
          trackingType: 'REPS',
          targetSets: 10,
          targetReps: 3,
          targetWeight: 120,
          targetDurationSeconds: null,
          restDurationSeconds: 300,
          notes: null,
        },
      ],
    });

    const history = loadSession(db, id)!;
    expect(history.exercises).toHaveLength(2);
    expect(history.exercises[0]).toMatchObject({ targetSets: 3, targetReps: 8, restDurationSeconds: 120 });
  });
});

describe('abandonSession', () => {
  it('usuwa sesję bez żadnej wykonanej serii', () => {
    const { db, planId } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    abandonSession(db, id, at(120));

    expect(loadSession(db, id)).toBeNull();
    expect(findActiveSessionId(db)).toBeNull();
    expect(db.select().from(schema.loggedSets).all()).toEqual([]);
  });

  it('zachowuje sesję z częściowym postępem', () => {
    const { db, planId } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const squat = loadSession(db, id)!.exercises[0];
    completeSet(db, squat.sets[0].id, { repsCompleted: 8 }, at(60));

    abandonSession(db, id, at(300));

    expect(
      db.select().from(schema.workoutSessions).where(eq(schema.workoutSessions.id, id)).get(),
    ).toMatchObject({ status: 'ABANDONED', totalDurationSeconds: 300 });
    expect(
      db
        .select()
        .from(schema.loggedSets)
        .where(and(eq(schema.loggedSets.sessionId, id)))
        .all(),
    ).toHaveLength(1);
  });
});

describe('swapSessionExercise', () => {
  it('przepisuje ćwiczenie i zostawia serie nietknięte', () => {
    const { db, planId, plank } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const squat = loadSession(db, id)!.exercises[0];
    completeSet(db, squat.sets[0].id, { repsCompleted: 8, weightKg: 60 }, at(60));

    swapSessionExercise(db, squat.id, plank.id);

    const after = loadSession(db, id)!.exercises[0];
    expect(after.exerciseId).toBe(plank.id);
    expect(after.name).toBe(plank.name);
    expect(after.sets.map((set) => [set.repsCompleted, set.weightKg])).toEqual(
      squat.sets.map((set) => [set.repsCompleted, set.weightKg]),
    );
  });

  it('przenosi serie do analityki nowego ćwiczenia', () => {
    const { db, planId, squat: squatExercise, plank } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const squat = loadSession(db, id)!.exercises[0];
    completeSet(db, squat.sets[0].id, { repsCompleted: 8, weightKg: 60 }, at(60));

    swapSessionExercise(db, squat.id, plank.id);

    // `logged_sets` trzyma własną kopię identyfikatora — bez jej przepisania tonaż i rekordy
    // dalej liczyłyby się staremu ćwiczeniu.
    const byExercise = (exerciseId: number) =>
      db.select().from(schema.loggedSets).where(eq(schema.loggedSets.exerciseId, exerciseId)).all();
    expect(byExercise(squatExercise.id)).toHaveLength(0);
    expect(byExercise(plank.id).length).toBeGreaterThan(0);
  });

  it('nie podmienia na ćwiczenie, którego nie ma', () => {
    const { db, planId } = setup();
    const id = startSession(db, { kind: 'plan', planId }, T0);
    const squat = loadSession(db, id)!.exercises[0];
    expect(() => swapSessionExercise(db, squat.id, 99999)).toThrow();
  });
});
