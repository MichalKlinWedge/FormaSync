import { count, eq, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { DifficultyLevel, TrackingType } from '@/db/schema';
import type { SyncDb } from '@/db/types';

export type ExerciseInput = {
  name: string;
  categoryId: number | null;
  secondaryCategoryIds: number[];
  equipmentId: number | null;
  difficultyLevel: DifficultyLevel | null;
  trackingType: TrackingType;
  instructions: string | null;
  techniqueNotes: string | null;
  imageUrl: string | null;
};

export class ExerciseValidationError extends Error {}

export function validateExercise(input: ExerciseInput): ExerciseInput {
  const name = input.name.trim();
  if (!name) throw new ExerciseValidationError('Podaj nazwę ćwiczenia.');
  if (input.categoryId === null) throw new ExerciseValidationError('Wybierz główną partię mięśniową.');
  const emptyToNull = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    ...input,
    name,
    // Partia główna nie jest jednocześnie dodatkową.
    secondaryCategoryIds: [...new Set(input.secondaryCategoryIds)].filter((id) => id !== input.categoryId),
    instructions: emptyToNull(input.instructions),
    techniqueNotes: emptyToNull(input.techniqueNotes),
  };
}

/** Tworzy (bez id) lub aktualizuje ćwiczenie wraz z dodatkowymi partiami mięśniowymi. Zwraca id. */
export function saveExercise(db: SyncDb, rawInput: ExerciseInput, id?: number): number {
  const { secondaryCategoryIds, ...values } = validateExercise(rawInput);
  return db.transaction((tx) => {
    let exerciseId: number;
    if (id === undefined) {
      exerciseId = tx
        .insert(schema.exercises)
        .values({ ...values, isCustom: true })
        .returning({ id: schema.exercises.id })
        .get().id;
    } else {
      tx.update(schema.exercises).set(values).where(eq(schema.exercises.id, id)).run();
      tx.delete(schema.exerciseMuscles).where(eq(schema.exerciseMuscles.exerciseId, id)).run();
      exerciseId = id;
    }
    if (secondaryCategoryIds.length > 0) {
      tx.insert(schema.exerciseMuscles)
        .values(secondaryCategoryIds.map((categoryId) => ({ exerciseId, categoryId })))
        .run();
    }
    return exerciseId;
  });
}

/**
 * Ćwiczenie spoza katalogu, zapisane w trakcie treningu — ma samą nazwę. Partii mięśniowej,
 * sprzętu ani opisu nie wymagamy, bo przy sztandze nikt nie wypełnia formularza; to, czego
 * brakuje, dopisuje się później w katalogu albo podmienia na gotowe ćwiczenie w historii.
 */
export function createQuickExercise(db: SyncDb, rawName: string): number {
  const name = rawName.trim();
  if (!name) throw new ExerciseValidationError('Podaj nazwę ćwiczenia.');

  // Ta sama nazwa drugi raz to zwykle to samo ćwiczenie — odzyskujemy je, zamiast mnożyć bliźniaki.
  const existing = db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(sql`lower(${schema.exercises.name}) = lower(${name})`)
    .get();
  if (existing) return existing.id;

  return db
    .insert(schema.exercises)
    .values({ name, isCustom: true })
    .returning({ id: schema.exercises.id })
    .get().id;
}

export type ExerciseUsage = { plans: number; loggedSets: number };

export function getExerciseUsage(db: SyncDb, id: number): ExerciseUsage {
  const plans =
    db
      .select({ n: count() })
      .from(schema.planExercises)
      .where(eq(schema.planExercises.exerciseId, id))
      .get()?.n ?? 0;
  const loggedSets =
    db.select({ n: count() }).from(schema.loggedSets).where(eq(schema.loggedSets.exerciseId, id)).get()?.n ?? 0;
  return { plans, loggedSets };
}

export class ExerciseInUseError extends Error {
  constructor(readonly usage: ExerciseUsage) {
    super('Ćwiczenie jest używane w planach lub historii treningów.');
  }
}

/** Usuwa własne ćwiczenie. Ćwiczeń używanych w planach/historii nie usuwamy, by nie tracić danych. */
export function deleteExercise(db: SyncDb, id: number): void {
  const usage = getExerciseUsage(db, id);
  if (usage.plans > 0 || usage.loggedSets > 0) throw new ExerciseInUseError(usage);
  db.delete(schema.exercises).where(eq(schema.exercises.id, id)).run();
}
