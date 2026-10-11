import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { todayKey } from '@/lib/date';

import { KIND_NOTES } from './shapes';

/**
 * Sprzątanie po poprzednich wersjach planu pod cel.
 *
 * Plan celu zamienia się na zwykłe plany treningowe i zwykłe terminy w kalendarzu — i to jest
 * zaleta: działają w przypomnieniach i na zegarku bez żadnego osobnego mechanizmu. Ma to jednak
 * drugą stronę. Gdy cel zostanie usunięty albo plan ułożony od nowa, jego terminy zostają
 * w kalendarzu, bo nic ich już nie pilnuje. Dwa plany pod ten sam cel dają wtedy dwa treningi
 * tego samego dnia, a lista planów puchnie od jednostek, których nikt nie wybierał.
 *
 * Rozpoznajemy je po opisie: planista celu wpisuje jedną ze swoich stałych notatek i nic innego
 * w aplikacji tak nie opisuje planu. Ręcznie ułożonego planu ani terminu wpisanego samodzielnie
 * to nie dotknie — i to jest tu warunek, a nie szczegół.
 */

const PLANNER_NOTES = new Set<string>(Object.values(KIND_NOTES));

/** Czy plan ułożył planista celu. */
export const plannerMade = (description: string | null): boolean =>
  description !== null && PLANNER_NOTES.has(description);

export type Junk = {
  /** Terminy z przyszłości, których nie pilnuje żaden cel. */
  terms: number;
  /** Plany planisty, do których nie prowadzi już nic. */
  plans: number;
};

const ids = (rows: { id: number | null }[]): Set<number> =>
  new Set(rows.map((row) => row.id).filter((id): id is number => id !== null));

/** Terminy do usunięcia: z przyszłości, niezrobione, bez treningu i bez celu, który by je znał. */
function strayTerms(db: SyncDb, from: string): number[] {
  const owned = ids(
    db.select({ id: schema.goalWorkouts.scheduledId }).from(schema.goalWorkouts).all(),
  );
  const used = ids(
    db.select({ id: schema.workoutSessions.scheduledId }).from(schema.workoutSessions).all(),
  );

  return db
    .select({
      id: schema.scheduledWorkouts.id,
      scheduledDate: schema.scheduledWorkouts.scheduledDate,
      isCompleted: schema.scheduledWorkouts.isCompleted,
      description: schema.workoutPlans.description,
    })
    .from(schema.scheduledWorkouts)
    .innerJoin(schema.workoutPlans, eq(schema.scheduledWorkouts.planId, schema.workoutPlans.id))
    .all()
    .filter(
      (row) =>
        row.scheduledDate >= from &&
        !row.isCompleted &&
        plannerMade(row.description) &&
        !owned.has(row.id) &&
        !used.has(row.id),
    )
    .map((row) => row.id);
}

/**
 * Plany do usunięcia: ułożone przez planistę i porzucone — bez terminu, bez przeprowadzonego
 * treningu i bez jednostki celu, która by je trzymała. Usunięcie planu zabiera ze sobą jego
 * terminy, więc plan z jakimkolwiek terminem poza usuwanymi zostaje nietknięty.
 */
function strayPlans(db: SyncDb, dropped: Set<number>): number[] {
  const kept = new Set<number>([
    ...db
      .select({ planId: schema.scheduledWorkouts.planId, id: schema.scheduledWorkouts.id })
      .from(schema.scheduledWorkouts)
      .all()
      .filter((row) => !dropped.has(row.id))
      .map((row) => row.planId),
    ...ids(db.select({ id: schema.workoutSessions.planId }).from(schema.workoutSessions).all()),
    ...ids(db.select({ id: schema.goalWorkouts.planId }).from(schema.goalWorkouts).all()),
  ]);

  return db
    .select({
      id: schema.workoutPlans.id,
      description: schema.workoutPlans.description,
      isTemplate: schema.workoutPlans.isTemplate,
    })
    .from(schema.workoutPlans)
    .all()
    .filter((plan) => !plan.isTemplate && plannerMade(plan.description) && !kept.has(plan.id))
    .map((plan) => plan.id);
}

/** Ile zostało do posprzątania. Liczymy przed pytaniem, bo to pytanie o usunięcie danych. */
export function findJunk(db: SyncDb, from: string = todayKey()): Junk {
  const terms = strayTerms(db, from);
  return { terms: terms.length, plans: strayPlans(db, new Set(terms)).length };
}

export function sweepJunk(db: SyncDb, from: string = todayKey()): Junk {
  const terms = strayTerms(db, from);
  const plans = strayPlans(db, new Set(terms));

  db.transaction((tx) => {
    for (const id of terms) {
      tx.delete(schema.scheduledWorkouts).where(eq(schema.scheduledWorkouts.id, id)).run();
    }
    for (const id of plans) {
      tx.delete(schema.workoutPlans).where(eq(schema.workoutPlans.id, id)).run();
    }
  });

  return { terms: terms.length, plans: plans.length };
}
