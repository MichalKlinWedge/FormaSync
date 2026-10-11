import { and, asc, desc, eq, ne } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import {
  ScheduleConflictError,
  scheduleWorkouts,
  updateScheduled,
} from '@/features/calendar/repository';
import { saveEndurancePlan } from '@/features/endurance/repository';
import { todayKey } from '@/lib/date';

import { serializeWeekDays } from './brief';
import { sweepJunk } from './cleanup';
import { draftFor } from './materialize';
import type { PlannedWeek } from './planner';
import { shiftByDays, type DayMap } from './reschedule';

/**
 * Cele i ich plany. Plan zapisujemy w całości naraz i trzymamy osobno od kalendarza, żeby dało
 * się go obejrzeć przed wpisaniem — a po wpisaniu wiadomo, który termin należy do którego celu.
 */

export type Goal = typeof schema.trainingGoals.$inferSelect;
export type GoalWorkout = typeof schema.goalWorkouts.$inferSelect;

export type GoalInput = {
  id?: number;
  sport: schema.Sport;
  title: string;
  eventDate: string;
  distanceMeters: number;
  targetSeconds: number | null;
  weekDays: number[];
  notes: string | null;
};

export class GoalValidationError extends Error {}

function validate(input: GoalInput): void {
  if (input.title.trim().length === 0) throw new GoalValidationError('Cel musi mieć nazwę.');
  if (input.distanceMeters <= 0) throw new GoalValidationError('Podaj dystans zawodów.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) {
    throw new GoalValidationError('Podaj datę zawodów.');
  }
  if (input.weekDays.length === 0) {
    throw new GoalValidationError('Wybierz przynajmniej jeden dzień tygodnia na treningi.');
  }
}

export function saveGoal(db: SyncDb, input: GoalInput): number {
  validate(input);
  const values = {
    sport: input.sport,
    title: input.title.trim(),
    eventDate: input.eventDate,
    distanceMeters: input.distanceMeters,
    targetSeconds: input.targetSeconds,
    weekDays: serializeWeekDays(input.weekDays),
    notes: input.notes?.trim() || null,
  };

  if (input.id === undefined) {
    return db.insert(schema.trainingGoals).values(values).returning({ id: schema.trainingGoals.id }).get().id;
  }
  db.update(schema.trainingGoals).set(values).where(eq(schema.trainingGoals.id, input.id)).run();
  return input.id;
}

/** Cele od najbliższego startu. Zakończone i porzucone na końcu — już nie wymagają uwagi. */
export function listGoals(db: SyncDb): Goal[] {
  return db
    .select()
    .from(schema.trainingGoals)
    .orderBy(asc(schema.trainingGoals.status), asc(schema.trainingGoals.eventDate))
    .all();
}

export const loadGoal = (db: SyncDb, id: number): Goal | null =>
  db.select().from(schema.trainingGoals).where(eq(schema.trainingGoals.id, id)).get() ?? null;

export function setGoalStatus(db: SyncDb, id: number, status: schema.GoalStatus): void {
  db.update(schema.trainingGoals).set({ status }).where(eq(schema.trainingGoals.id, id)).run();
}

/**
 * Usuwa cel razem z tym, co po nim zostaje w przyszłości: terminami, których nikt już nie
 * pilnuje, i planami jednostek, do których nic nie prowadzi. Bez tego kolejny cel dokładał swoje
 * terminy do poprzednich i w kalendarzu stały dwa treningi tego samego dnia.
 *
 * Przeszłość zostaje nietknięta — termin, z którego powstał trening, jest częścią historii,
 * a nie planu.
 */
export function deleteGoal(db: SyncDb, id: number, from: string = todayKey()): void {
  db.delete(schema.trainingGoals).where(eq(schema.trainingGoals.id, id)).run();
  sweepJunk(db, from);
}

/** Czy z jednostki coś już zostało: odbyty trening albo odhaczony termin. */
function finished(db: SyncDb, workout: GoalWorkout): boolean {
  if (workout.scheduledId === null) return false;
  const term = db
    .select({ isCompleted: schema.scheduledWorkouts.isCompleted })
    .from(schema.scheduledWorkouts)
    .where(eq(schema.scheduledWorkouts.id, workout.scheduledId))
    .get();
  if (term === undefined) return false;
  if (term.isCompleted) return true;

  return (
    db
      .select({ id: schema.workoutSessions.id })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.scheduledId, workout.scheduledId))
      .get() !== undefined
  );
}

/**
 * Zapisuje wygenerowany plan w miejsce poprzedniego. Przeliczenie ma dać jeden plan, a nie dwa
 * obok siebie: cała przyszłość jest układana od nowa, razem z terminami, które zdążyły trafić do
 * kalendarza. Wcześniej zostawały, więc drugi plan dokładał swoje jednostki do pierwszego i ten
 * sam dzień bywał rozpisany dwa razy.
 *
 * Nie ruszamy przeszłości ani niczego, co się odbyło — to już historia treningu, nie plan.
 * Terminy po usuniętych jednostkach sprzątamy tą samą drogą, co bezpańskie wpisy po celu.
 */
export function savePlan(
  db: SyncDb,
  goalId: number,
  weeks: PlannedWeek[],
  plannedBy: string,
  from: string = todayKey(),
): number {
  const kept = goalPlan(db, goalId).filter(
    (workout) => workout.plannedDate < from || finished(db, workout),
  );
  const keptIds = new Set(kept.map((workout) => workout.id));

  for (const workout of goalPlan(db, goalId)) {
    if (keptIds.has(workout.id)) continue;
    db.delete(schema.goalWorkouts).where(eq(schema.goalWorkouts.id, workout.id)).run();
  }
  // Terminy po usuniętych jednostkach nie mają już właściciela — i tak je rozpoznajemy.
  sweepJunk(db, from);

  const taken = new Set(kept.map((workout) => workout.plannedDate));
  const rows = weeks
    .flatMap((week) => week.workouts)
    .filter((workout) => workout.plannedDate >= from && !taken.has(workout.plannedDate))
    .map((workout) => ({
      goalId,
      weekIndex: workout.weekIndex,
      phase: workout.phase,
      plannedDate: workout.plannedDate,
      kind: workout.kind,
      title: workout.title,
      distanceMeters: workout.distanceMeters,
      durationSeconds: workout.durationSeconds,
      paceSeconds: workout.paceSeconds,
      notes: workout.notes,
    }));

  if (rows.length > 0) db.insert(schema.goalWorkouts).values(rows).run();
  db.update(schema.trainingGoals)
    .set({ plannedBy })
    .where(eq(schema.trainingGoals.id, goalId))
    .run();
  return rows.length;
}

/** Jednostki planu po dacie. */
export function goalPlan(db: SyncDb, goalId: number): GoalWorkout[] {
  return db
    .select()
    .from(schema.goalWorkouts)
    .where(eq(schema.goalWorkouts.goalId, goalId))
    .orderBy(asc(schema.goalWorkouts.plannedDate), asc(schema.goalWorkouts.id))
    .all();
}

export type MaterializeOptions = {
  scheduledTime: string | null;
  reminderOffsetMinutes: number | null;
  /** Od którego dnia wpisywać. Przeszłości nie planujemy. */
  from?: string;
};

/**
 * Wpisuje plan do kalendarza: każda jednostka staje się planem z odcinkami i terminem w swoim
 * dniu. Jednostki już wpisane pomijamy, więc ponowne naciśnięcie nie tworzy duplikatów.
 */
export function materializeGoal(db: SyncDb, goalId: number, options: MaterializeOptions): number {
  const goal = loadGoal(db, goalId);
  if (goal === null) throw new Error(`Cel ${goalId} nie istnieje`);
  const from = options.from ?? todayKey();

  const pending = goalPlan(db, goalId).filter(
    (workout) => workout.scheduledId === null && workout.plannedDate >= from,
  );

  let written = 0;
  for (const workout of pending) {
    const draft = draftFor(
      {
        kind: workout.kind,
        title: workout.title,
        distanceMeters: workout.distanceMeters,
        paceSeconds: workout.paceSeconds,
        notes: workout.notes,
      },
      goal.sport,
    );
    if (draft.segments.length === 0) continue;

    const planId = saveEndurancePlan(db, draft);
    scheduleWorkouts(db, {
      planId,
      dates: [workout.plannedDate],
      scheduledTime: options.scheduledTime,
      reminderOffsetMinutes: options.reminderOffsetMinutes,
    });
    // Termin odczytujemy po zapisie: `scheduleWorkouts` zwraca liczbę, a potrzebny jest numer,
    // po którym poznamy, że ta jednostka już w kalendarzu jest.
    const scheduled = db
      .select({ id: schema.scheduledWorkouts.id })
      .from(schema.scheduledWorkouts)
      .where(
        and(
          eq(schema.scheduledWorkouts.planId, planId),
          eq(schema.scheduledWorkouts.scheduledDate, workout.plannedDate),
        ),
      )
      .get();

    db.update(schema.goalWorkouts)
      .set({ planId, scheduledId: scheduled?.id ?? null })
      .where(eq(schema.goalWorkouts.id, workout.id))
      .run();
    written += 1;
  }

  return written;
}

export type MovedTerm = {
  scheduledId: number;
  planId: number;
  /** Numer wpisu w kalendarzu Garmina; null, gdy termin tam nie trafił. */
  garminScheduleId: string | null;
  from: string;
  to: string;
};

export type GoalShift = {
  moved: number;
  /** Jednostki z przyszłości, które zostały na swoim dniu — zabrakło dla nich miejsca. */
  frozen: number;
  /** Jednostki z przeszłości i sam start: tych nie ruszamy nigdy. */
  anchored: number;
  /** Terminy w kalendarzu, które poszły za planem — po nich poznajemy, co poprawić u Garmina. */
  terms: MovedTerm[];
};

/**
 * Przestawia gotowy plan na inne dni tygodnia. Układ zostaje: te same jednostki, te same
 * objętości i te same tygodnie — zmieniają się wyłącznie daty, a za nimi terminy w kalendarzu.
 *
 * Dni zapisujemy też na samym celu, żeby kolejne przeliczenie planu nie wróciło do tych, które
 * okazały się pomyłką.
 */
export function moveGoalDays(
  db: SyncDb,
  goalId: number,
  map: DayMap,
  from: string = todayKey(),
): GoalShift {
  const days = [...new Set(Object.values(map))].sort((a, b) => a - b);
  if (days.length === 0) {
    throw new GoalValidationError('Wybierz przynajmniej jeden dzień tygodnia na treningi.');
  }
  if (days.length !== Object.keys(map).length) {
    throw new GoalValidationError('Dwa dni planu trafiłyby na ten sam dzień tygodnia.');
  }

  const workouts = goalPlan(db, goalId);
  const shift = shiftByDays(workouts, map, from);
  const byId = new Map(workouts.map((workout) => [workout.id, workout]));

  let moved = 0;
  let frozen = shift.frozen;
  const terms: MovedTerm[] = [];

  for (const move of shift.moves) {
    const workout = byId.get(move.id);
    if (workout === undefined) continue;

    if (workout.scheduledId !== null) {
      const entry = db
        .select({
          planId: schema.scheduledWorkouts.planId,
          scheduledTime: schema.scheduledWorkouts.scheduledTime,
          reminderOffsetMinutes: schema.scheduledWorkouts.reminderOffsetMinutes,
          isCompleted: schema.scheduledWorkouts.isCompleted,
          garminScheduleId: schema.scheduledWorkouts.garminScheduleId,
        })
        .from(schema.scheduledWorkouts)
        .where(eq(schema.scheduledWorkouts.id, workout.scheduledId))
        .get();

      // Termin odhaczony jako zrobiony zostaje na dniu, w którym się odbył.
      if (entry === undefined || entry.isCompleted) {
        frozen += 1;
        continue;
      }

      try {
        updateScheduled(db, workout.scheduledId, {
          scheduledDate: move.to,
          scheduledTime: entry.scheduledTime,
          reminderOffsetMinutes: entry.reminderOffsetMinutes,
        });
      } catch (error) {
        // Dzień zajęty przez ten sam plan: zostawiamy jednostkę, zamiast zlewać dwa terminy.
        if (error instanceof ScheduleConflictError) {
          frozen += 1;
          continue;
        }
        throw error;
      }

      terms.push({
        scheduledId: workout.scheduledId,
        planId: entry.planId,
        garminScheduleId: entry.garminScheduleId,
        from: move.from,
        to: move.to,
      });
    }

    db.update(schema.goalWorkouts)
      .set({ plannedDate: move.to })
      .where(eq(schema.goalWorkouts.id, move.id))
      .run();
    moved += 1;
  }

  db.update(schema.trainingGoals)
    .set({ weekDays: serializeWeekDays(days) })
    .where(eq(schema.trainingGoals.id, goalId))
    .run();

  return {
    moved,
    frozen,
    anchored: workouts.filter(
      (workout) => workout.kind === 'RACE' || workout.plannedDate < from,
    ).length,
    terms,
  };
}

export type GoalProgress = {
  planned: number;
  scheduled: number;
  done: number;
  plannedMeters: number;
  doneMeters: number;
};

/**
 * Postęp celu. „Zrobione” liczymy z sesji dopiętych do terminów tego celu, a nie ze wszystkich
 * treningów dyscypliny — plan ma mówić, ile z niego dowieziono, nie ile się w ogóle ruszało.
 */
export function goalProgress(db: SyncDb, goalId: number): GoalProgress {
  const workouts = goalPlan(db, goalId);
  const scheduledIds = workouts
    .map((workout) => workout.scheduledId)
    .filter((id): id is number => id !== null);

  const sessions =
    scheduledIds.length === 0
      ? []
      : db
          .select({
            scheduledId: schema.workoutSessions.scheduledId,
            meters: schema.loggedSegments.distanceMeters,
          })
          .from(schema.workoutSessions)
          .leftJoin(
            schema.loggedSegments,
            eq(schema.loggedSegments.sessionId, schema.workoutSessions.id),
          )
          .where(ne(schema.workoutSessions.status, 'IN_PROGRESS'))
          .all()
          .filter((row) => row.scheduledId !== null && scheduledIds.includes(row.scheduledId));

  const doneIds = new Set(sessions.map((row) => row.scheduledId));
  return {
    planned: workouts.length,
    scheduled: scheduledIds.length,
    done: doneIds.size,
    plannedMeters: Math.round(workouts.reduce((sum, workout) => sum + (workout.distanceMeters ?? 0), 0)),
    doneMeters: Math.round(sessions.reduce((sum, row) => sum + (row.meters ?? 0), 0)),
  };
}

/** Najbliższy cel w toku — do kafelka na „Dziś” i wejścia z zakładki Plany. */
export function activeGoal(db: SyncDb, from: string = todayKey()): Goal | null {
  return (
    db
      .select()
      .from(schema.trainingGoals)
      .where(eq(schema.trainingGoals.status, 'ACTIVE'))
      .orderBy(asc(schema.trainingGoals.eventDate))
      .all()
      .find((goal) => goal.eventDate >= from) ?? null
  );
}

/** Cele zakończone albo porzucone, od najnowszego — do listy pod aktywnymi. */
export const pastGoals = (db: SyncDb): Goal[] =>
  db
    .select()
    .from(schema.trainingGoals)
    .where(ne(schema.trainingGoals.status, 'ACTIVE'))
    .orderBy(desc(schema.trainingGoals.eventDate))
    .all();
