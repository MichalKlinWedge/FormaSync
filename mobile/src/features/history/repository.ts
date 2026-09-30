import { and, asc, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

export type HistoryEntry = {
  id: number;
  startTime: string;
  title: string;
  status: schema.SessionStatus;
  durationSeconds: number | null;
  rpeRating: number | null;
  userNotes: string | null;
  completedSets: number;
  tonnage: number;
};

/** Zakończone i przerwane treningi, od najnowszego. */
export function listHistory(db: SyncDb): HistoryEntry[] {
  return db
    .select({
      id: schema.workoutSessions.id,
      startTime: schema.workoutSessions.startTime,
      title: schema.workoutSessions.title,
      planTitle: schema.workoutPlans.title,
      status: schema.workoutSessions.status,
      durationSeconds: schema.workoutSessions.totalDurationSeconds,
      rpeRating: schema.workoutSessions.rpeRating,
      userNotes: schema.workoutSessions.userNotes,
      completedSets: sql<number>`count(${schema.loggedSets.id})`,
      tonnage: sql<number>`coalesce(sum(coalesce(${schema.loggedSets.repsCompleted}, 0) * coalesce(${schema.loggedSets.weightKg}, 0)), 0)`,
    })
    .from(schema.workoutSessions)
    .leftJoin(schema.workoutPlans, eq(schema.workoutSessions.planId, schema.workoutPlans.id))
    .leftJoin(
      schema.loggedSets,
      and(
        eq(schema.loggedSets.sessionId, schema.workoutSessions.id),
        isNotNull(schema.loggedSets.completedAt),
      ),
    )
    .where(ne(schema.workoutSessions.status, 'IN_PROGRESS'))
    .groupBy(schema.workoutSessions.id)
    .orderBy(desc(schema.workoutSessions.startTime))
    .all()
    .map(({ planTitle, title, ...rest }) => ({ ...rest, title: title ?? planTitle ?? 'Trening' }));
}

export type SessionMeta = {
  userNotes: string | null;
  rpeRating: number | null;
  totalDurationSeconds: number | null;
  status: schema.SessionStatus;
};

export function loadSessionMeta(db: SyncDb, sessionId: number): SessionMeta | null {
  const row = db
    .select({
      userNotes: schema.workoutSessions.userNotes,
      rpeRating: schema.workoutSessions.rpeRating,
      totalDurationSeconds: schema.workoutSessions.totalDurationSeconds,
      status: schema.workoutSessions.status,
    })
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.id, sessionId))
    .get();
  return row ?? null;
}

export function updateSessionMeta(
  db: SyncDb,
  sessionId: number,
  values: { userNotes?: string | null; rpeRating?: number | null },
): void {
  db.update(schema.workoutSessions)
    .set(values)
    .where(eq(schema.workoutSessions.id, sessionId))
    .run();
}

export function deleteSession(db: SyncDb, sessionId: number): void {
  db.delete(schema.workoutSessions).where(eq(schema.workoutSessions.id, sessionId)).run();
}

export type PlanUpdateChange = {
  planExerciseId: number;
  exerciseName: string;
  field: 'targetWeight' | 'targetReps' | 'targetDurationSeconds';
  from: number | null;
  to: number;
};

export type PlanUpdateProposal = { planId: number; planTitle: string; changes: PlanUpdateChange[] };

const FIELD_LABELS: Record<PlanUpdateChange['field'], string> = {
  targetWeight: 'ciężar',
  targetReps: 'powtórzenia',
  targetDurationSeconds: 'czas serii',
};

export const describeChange = (change: PlanUpdateChange): string =>
  `${change.exerciseName}: ${FIELD_LABELS[change.field]} ${change.from ?? '–'} → ${change.to}`;

/**
 * Proponuje podniesienie celów planu do wartości faktycznie wykonanych — bierze ostatnią
 * ukończoną serię każdego ćwiczenia. Zwraca null, gdy sesja nie pochodzi z istniejącego planu.
 */
export function proposePlanUpdate(db: SyncDb, sessionId: number): PlanUpdateProposal | null {
  const session = db
    .select()
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.id, sessionId))
    .get();
  if (!session?.planId) return null;

  const plan = db
    .select()
    .from(schema.workoutPlans)
    .where(eq(schema.workoutPlans.id, session.planId))
    .get();
  if (!plan || plan.isTemplate) return null;

  const planItems = db
    .select()
    .from(schema.planExercises)
    .where(eq(schema.planExercises.planId, plan.id))
    .orderBy(asc(schema.planExercises.orderIndex))
    .all();
  const sessionItems = db
    .select()
    .from(schema.sessionExercises)
    .where(eq(schema.sessionExercises.sessionId, sessionId))
    .orderBy(asc(schema.sessionExercises.orderIndex))
    .all();
  const sets = db
    .select()
    .from(schema.loggedSets)
    .where(and(eq(schema.loggedSets.sessionId, sessionId), isNotNull(schema.loggedSets.completedAt)))
    .orderBy(asc(schema.loggedSets.setNumber))
    .all();

  // Te same ćwiczenia mogą wystąpić w planie kilka razy — dopasowujemy je po kolei.
  const queues = new Map<number, (typeof planItems)[number][]>();
  for (const item of planItems) {
    queues.set(item.exerciseId, [...(queues.get(item.exerciseId) ?? []), item]);
  }

  const names = new Map(
    db
      .select({ id: schema.exercises.id, name: schema.exercises.name })
      .from(schema.exercises)
      .all()
      .map((e) => [e.id, e.name] as const),
  );

  const changes: PlanUpdateChange[] = [];
  for (const sessionItem of sessionItems) {
    const planItem = queues.get(sessionItem.exerciseId)?.shift();
    if (!planItem) continue;

    const last = sets.filter((s) => s.sessionExerciseId === sessionItem.id).at(-1);
    if (!last) continue;

    const exerciseName = names.get(sessionItem.exerciseId) ?? 'Ćwiczenie';

    const candidates: [PlanUpdateChange['field'], number | null, number | null][] = [
      ['targetWeight', planItem.targetWeight, last.weightKg],
      ['targetReps', planItem.targetReps, last.repsCompleted],
      ['targetDurationSeconds', planItem.targetDurationSeconds, last.durationSeconds],
    ];
    for (const [field, from, to] of candidates) {
      // Pole nieużywane w tym ćwiczeniu (np. czas przy ćwiczeniu na powtórzenia) zostawiamy w spokoju.
      if (to === null || from === to) continue;
      changes.push({ planExerciseId: planItem.id, exerciseName, field, from, to });
    }
  }

  return { planId: plan.id, planTitle: plan.title, changes };
}

export function applyPlanUpdate(db: SyncDb, changes: PlanUpdateChange[]): void {
  if (changes.length === 0) return;
  db.transaction((tx) => {
    for (const change of changes) {
      tx.update(schema.planExercises)
        .set({ [change.field]: change.to })
        .where(eq(schema.planExercises.id, change.planExerciseId))
        .run();
    }
  });
}
