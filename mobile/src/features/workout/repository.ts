import { and, asc, eq, isNotNull, isNull, max } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

import { type ActiveSession, elapsedSeconds } from './logic';

export const nowIso = () => new Date().toISOString();

export class ActiveSessionExistsError extends Error {
  constructor(readonly sessionId: number) {
    super('Trwa już inna sesja treningowa.');
  }
}

export type StartSessionOptions =
  | { kind: 'plan'; planId: number }
  | { kind: 'scheduled'; scheduledId: number }
  | { kind: 'empty'; sport?: schema.Sport };

/** Id trwającej sesji albo null. Aplikacja dopuszcza tylko jedną sesję naraz. */
export function findActiveSessionId(db: SyncDb): number | null {
  const row = db
    .select({ id: schema.workoutSessions.id })
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.status, 'IN_PROGRESS'))
    .orderBy(asc(schema.workoutSessions.id))
    .get();
  return row?.id ?? null;
}

/** Sport trwającej sesji — decyduje, który ekran treningu pokazać. */
export function activeSessionSport(db: SyncDb, sessionId: number): schema.Sport | null {
  return (
    db
      .select({ sport: schema.workoutSessions.sport })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, sessionId))
      .get()?.sport ?? null
  );
}

/**
 * Rozpoczyna sesję i utrwala w niej migawkę planu (session_exercises) wraz z zaplanowanymi
 * seriami (logged_sets z completed_at = null). Wartości docelowe trafiają do serii jako
 * podpowiedź — użytkownik zatwierdza je jednym dotknięciem lub poprawia.
 */
export function startSession(db: SyncDb, options: StartSessionOptions, now = nowIso()): number {
  const active = findActiveSessionId(db);
  if (active !== null) throw new ActiveSessionExistsError(active);

  const scheduled =
    options.kind === 'scheduled'
      ? db
          .select()
          .from(schema.scheduledWorkouts)
          .where(eq(schema.scheduledWorkouts.id, options.scheduledId))
          .get()
      : null;
  if (options.kind === 'scheduled' && !scheduled) throw new Error('Zaplanowany trening nie istnieje');

  const planId = options.kind === 'plan' ? options.planId : (scheduled?.planId ?? null);
  const plan =
    planId === null
      ? null
      : (db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).get() ?? null);
  // Trening bez planu zapisujemy w sporcie, który jest właśnie wybrany w aplikacji.
  const sport = plan?.sport ?? (options.kind === 'empty' ? (options.sport ?? 'STRENGTH') : 'STRENGTH');

  return db.transaction((tx) => {
    const sessionId = tx
      .insert(schema.workoutSessions)
      .values({
        planId,
        title: plan?.title ?? null,
        sport,
        scheduledId: scheduled?.id ?? null,
        status: 'IN_PROGRESS',
        startTime: now,
      })
      .returning({ id: schema.workoutSessions.id })
      .get().id;

    if (planId !== null && isEnduranceSport(sport)) {
      insertSessionSegments(tx, sessionId, planId);
    } else if (planId !== null) {
      const planItems = tx
        .select()
        .from(schema.planExercises)
        .where(eq(schema.planExercises.planId, planId))
        .orderBy(asc(schema.planExercises.orderIndex))
        .all();
      for (const item of planItems) {
        const sessionExerciseId = tx
          .insert(schema.sessionExercises)
          .values({
            sessionId,
            exerciseId: item.exerciseId,
            orderIndex: item.orderIndex,
            targetSets: item.targetSets,
            targetReps: item.targetReps,
            targetWeight: item.targetWeight,
            targetDurationSeconds: item.targetDurationSeconds,
            restDurationSeconds: item.restDurationSeconds,
            notes: item.notes,
          })
          .returning({ id: schema.sessionExercises.id })
          .get().id;
        insertPlannedSets(tx, sessionId, sessionExerciseId, item.exerciseId, item.targetSets, {
          reps: item.targetReps,
          weight: item.targetWeight,
          duration: item.targetDurationSeconds,
        });
      }
    }
    return sessionId;
  });
}

const isEnduranceSport = (sport: schema.Sport) => sport !== 'STRENGTH';

/**
 * Migawka odcinków planu wytrzymałościowego wraz z zaplanowanym wykonaniem. Grupa powtórzeń
 * rozwija się na tyle wierszy, ile iteracji — inaczej nie dałoby się pokazać, które okrążenie
 * było wolniejsze. Kolejność wierszy to kolejność biegu, nie kolejność zapisu w planie.
 */
function insertSessionSegments(tx: SyncDb, sessionId: number, planId: number): void {
  const planRows = tx
    .select()
    .from(schema.planSegments)
    .where(eq(schema.planSegments.planId, planId))
    .orderBy(asc(schema.planSegments.orderIndex))
    .all();

  const idByPlanId = new Map<number, number>();
  for (const row of planRows) {
    const inserted = tx
      .insert(schema.sessionSegments)
      .values({
        sessionId,
        parentId: row.parentId === null ? null : (idByPlanId.get(row.parentId) ?? null),
        orderIndex: row.orderIndex,
        kind: row.kind,
        repeatCount: row.repeatCount,
        durationType: row.durationType,
        distanceMeters: row.distanceMeters,
        durationSeconds: row.durationSeconds,
        targetType: row.targetType,
        targetLow: row.targetLow,
        targetHigh: row.targetHigh,
        stroke: row.stroke,
        notes: row.notes,
      })
      .returning({ id: schema.sessionSegments.id })
      .get();
    idByPlanId.set(row.id, inserted.id);
  }

  let orderIndex = 0;
  const planned = (planSegmentId: number, iteration: number) => {
    const sessionSegmentId = idByPlanId.get(planSegmentId);
    if (sessionSegmentId === undefined) return;
    tx.insert(schema.loggedSegments)
      .values({ sessionId, sessionSegmentId, orderIndex: orderIndex++, iteration })
      .run();
  };

  for (const row of planRows.filter((r) => r.parentId === null)) {
    if (row.kind !== 'REPEAT') {
      planned(row.id, 1);
      continue;
    }
    const inside = planRows.filter((r) => r.parentId === row.id);
    for (let iteration = 1; iteration <= (row.repeatCount ?? 1); iteration += 1) {
      for (const child of inside) planned(child.id, iteration);
    }
  }
}

type SetDefaults = { reps: number | null; weight: number | null; duration: number | null };

function insertPlannedSets(
  tx: SyncDb,
  sessionId: number,
  sessionExerciseId: number,
  exerciseId: number,
  count: number,
  defaults: SetDefaults,
  firstSetNumber = 1,
) {
  if (count <= 0) return;
  tx.insert(schema.loggedSets)
    .values(
      Array.from({ length: count }, (_, i) => ({
        sessionId,
        sessionExerciseId,
        exerciseId,
        setNumber: firstSetNumber + i,
        repsCompleted: defaults.reps,
        weightKg: defaults.weight,
        durationSeconds: defaults.duration,
        completedAt: null,
      })),
    )
    .run();
}

/** Wczytuje sesję z ćwiczeniami i seriami w kolejności planu. */
export function loadSession(db: SyncDb, sessionId: number): ActiveSession | null {
  const session = db
    .select({ session: schema.workoutSessions, planTitle: schema.workoutPlans.title })
    .from(schema.workoutSessions)
    .leftJoin(schema.workoutPlans, eq(schema.workoutSessions.planId, schema.workoutPlans.id))
    .where(eq(schema.workoutSessions.id, sessionId))
    .get();
  if (!session) return null;

  const exerciseRows = db
    .select({ se: schema.sessionExercises, exercise: schema.exercises })
    .from(schema.sessionExercises)
    .innerJoin(schema.exercises, eq(schema.sessionExercises.exerciseId, schema.exercises.id))
    .where(eq(schema.sessionExercises.sessionId, sessionId))
    .orderBy(asc(schema.sessionExercises.orderIndex), asc(schema.sessionExercises.id))
    .all();

  const setRows = db
    .select()
    .from(schema.loggedSets)
    .where(eq(schema.loggedSets.sessionId, sessionId))
    .orderBy(asc(schema.loggedSets.setNumber), asc(schema.loggedSets.id))
    .all();

  return {
    id: session.session.id,
    startTime: session.session.startTime,
    title: session.session.title ?? session.planTitle ?? 'Trening',
    planId: session.session.planId,
    scheduledId: session.session.scheduledId,
    exercises: exerciseRows.map(({ se, exercise }) => ({
      id: se.id,
      exerciseId: exercise.id,
      name: exercise.name,
      trackingType: exercise.trackingType,
      targetSets: se.targetSets,
      targetReps: se.targetReps,
      targetWeight: se.targetWeight,
      targetDurationSeconds: se.targetDurationSeconds,
      restDurationSeconds: se.restDurationSeconds,
      sets: setRows
        .filter((s) => s.sessionExerciseId === se.id)
        .map((s) => ({
          id: s.id,
          setNumber: s.setNumber,
          repsCompleted: s.repsCompleted,
          weightKg: s.weightKg,
          durationSeconds: s.durationSeconds,
          rpe: s.rpe,
          completedAt: s.completedAt,
        })),
    })),
  };
}

export type SetValues = {
  repsCompleted?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  rpe?: number | null;
};

/** Każda zmiana trafia od razu do bazy — sesja przeżywa zamknięcie aplikacji. */
export function updateSet(db: SyncDb, setId: number, values: SetValues): void {
  db.update(schema.loggedSets).set(values).where(eq(schema.loggedSets.id, setId)).run();
}

export function completeSet(db: SyncDb, setId: number, values: SetValues = {}, now = nowIso()): void {
  db.update(schema.loggedSets)
    .set({ ...values, completedAt: now })
    .where(eq(schema.loggedSets.id, setId))
    .run();
}

/** Cofa oznaczenie serii jako wykonanej (pomyłka podczas treningu). */
export function reopenSet(db: SyncDb, setId: number): void {
  db.update(schema.loggedSets).set({ completedAt: null }).where(eq(schema.loggedSets.id, setId)).run();
}

/** Dodaje kolejną serię ponad plan, kopiując wartości z ostatniej serii ćwiczenia. */
export function addSet(db: SyncDb, sessionExerciseId: number): number {
  return db.transaction((tx) => {
    const exercise = tx
      .select()
      .from(schema.sessionExercises)
      .where(eq(schema.sessionExercises.id, sessionExerciseId))
      .get();
    if (!exercise) throw new Error('Ćwiczenie nie należy do sesji');

    const last = tx
      .select()
      .from(schema.loggedSets)
      .where(eq(schema.loggedSets.sessionExerciseId, sessionExerciseId))
      .orderBy(asc(schema.loggedSets.setNumber))
      .all()
      .at(-1);

    return tx
      .insert(schema.loggedSets)
      .values({
        sessionId: exercise.sessionId,
        sessionExerciseId,
        exerciseId: exercise.exerciseId,
        setNumber: (last?.setNumber ?? 0) + 1,
        repsCompleted: last?.repsCompleted ?? exercise.targetReps,
        weightKg: last?.weightKg ?? exercise.targetWeight,
        durationSeconds: last?.durationSeconds ?? exercise.targetDurationSeconds,
        completedAt: null,
      })
      .returning({ id: schema.loggedSets.id })
      .get().id;
  });
}

export function removeSet(db: SyncDb, setId: number): void {
  db.delete(schema.loggedSets).where(eq(schema.loggedSets.id, setId)).run();
}

/** Dodaje ćwiczenie do trwającej sesji (trening „pusty” lub zmiana w trakcie). */
export function addSessionExercise(db: SyncDb, sessionId: number, exerciseId: number): number {
  return db.transaction((tx) => {
    const exercise = tx.select().from(schema.exercises).where(eq(schema.exercises.id, exerciseId)).get();
    if (!exercise) throw new Error('Ćwiczenie nie istnieje');

    const lastOrder =
      tx
        .select({ value: max(schema.sessionExercises.orderIndex) })
        .from(schema.sessionExercises)
        .where(eq(schema.sessionExercises.sessionId, sessionId))
        .get()?.value ?? -1;

    const timed = exercise.trackingType === 'TIME';
    const sessionExerciseId = tx
      .insert(schema.sessionExercises)
      .values({
        sessionId,
        exerciseId,
        orderIndex: lastOrder + 1,
        targetSets: 3,
        targetReps: timed ? null : 10,
        targetWeight: null,
        targetDurationSeconds: timed ? 30 : null,
        restDurationSeconds: 90,
      })
      .returning({ id: schema.sessionExercises.id })
      .get().id;

    insertPlannedSets(tx, sessionId, sessionExerciseId, exerciseId, 3, {
      reps: timed ? null : 10,
      weight: null,
      duration: timed ? 30 : null,
    });
    return sessionExerciseId;
  });
}

export function removeSessionExercise(db: SyncDb, sessionExerciseId: number): void {
  db.delete(schema.sessionExercises).where(eq(schema.sessionExercises.id, sessionExerciseId)).run();
}

export type FinishValues = { userNotes?: string | null; rpeRating?: number | null };

/**
 * Kończy sesję: usuwa niewykonane serie (plan pozostaje w session_exercises, więc nadal wiadomo,
 * ile serii zaplanowano) i oznacza powiązany termin w kalendarzu jako zrealizowany.
 */
export function finishSession(db: SyncDb, sessionId: number, values: FinishValues = {}, now = nowIso()): void {
  db.transaction((tx) => {
    const session = tx
      .select()
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, sessionId))
      .get();
    if (!session) throw new Error('Sesja nie istnieje');

    tx.delete(schema.loggedSets)
      .where(and(eq(schema.loggedSets.sessionId, sessionId), isNull(schema.loggedSets.completedAt)))
      .run();
    tx.delete(schema.loggedSegments)
      .where(and(eq(schema.loggedSegments.sessionId, sessionId), isNull(schema.loggedSegments.completedAt)))
      .run();

    tx.update(schema.workoutSessions)
      .set({
        ...values,
        status: 'COMPLETED',
        endTime: now,
        totalDurationSeconds: elapsedSeconds(session.startTime, Date.parse(now)),
      })
      .where(eq(schema.workoutSessions.id, sessionId))
      .run();

    if (session.scheduledId !== null) {
      tx.update(schema.scheduledWorkouts)
        .set({ isCompleted: true })
        .where(eq(schema.scheduledWorkouts.id, session.scheduledId))
        .run();
    }
  });
}

/**
 * Porzuca sesję. Sesję bez ani jednej wykonanej serii usuwamy w całości, żeby historia
 * nie zapełniała się pustymi wpisami.
 */
export function abandonSession(db: SyncDb, sessionId: number, now = nowIso()): void {
  db.transaction((tx) => {
    const session = tx
      .select()
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, sessionId))
      .get();
    if (!session) return;

    const anyCompleted = tx
      .select({ id: schema.loggedSets.id })
      .from(schema.loggedSets)
      .where(and(eq(schema.loggedSets.sessionId, sessionId), isNotNull(schema.loggedSets.completedAt)))
      .get();
    const anySegment = tx
      .select({ id: schema.loggedSegments.id })
      .from(schema.loggedSegments)
      .where(
        and(eq(schema.loggedSegments.sessionId, sessionId), isNotNull(schema.loggedSegments.completedAt)),
      )
      .get();
    if (!anyCompleted && !anySegment) {
      tx.delete(schema.workoutSessions).where(eq(schema.workoutSessions.id, sessionId)).run();
      return;
    }

    tx.delete(schema.loggedSets)
      .where(and(eq(schema.loggedSets.sessionId, sessionId), isNull(schema.loggedSets.completedAt)))
      .run();
    tx.delete(schema.loggedSegments)
      .where(and(eq(schema.loggedSegments.sessionId, sessionId), isNull(schema.loggedSegments.completedAt)))
      .run();
    tx.update(schema.workoutSessions)
      .set({
        status: 'ABANDONED',
        endTime: now,
        totalDurationSeconds: elapsedSeconds(session.startTime, Date.parse(now)),
      })
      .where(eq(schema.workoutSessions.id, sessionId))
      .run();
  });
}
