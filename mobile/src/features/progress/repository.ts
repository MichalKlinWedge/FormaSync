import { and, asc, desc, eq, isNotNull, ne } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

import type { CompletedSet } from './analytics';

/**
 * Wszystkie wykonane serie z kontekstem sesji i ćwiczenia. Agregacje liczymy w JavaScripcie,
 * bo grupowanie po dniach musi używać czasu lokalnego, a SQLite traktowałby znaczniki jako UTC.
 */
export function loadCompletedSets(db: SyncDb): CompletedSet[] {
  return db
    .select({
      sessionId: schema.loggedSets.sessionId,
      startTime: schema.workoutSessions.startTime,
      exerciseId: schema.loggedSets.exerciseId,
      exerciseName: schema.exercises.name,
      categoryName: schema.categories.name,
      reps: schema.loggedSets.repsCompleted,
      weightKg: schema.loggedSets.weightKg,
      durationSeconds: schema.loggedSets.durationSeconds,
    })
    .from(schema.loggedSets)
    .innerJoin(schema.workoutSessions, eq(schema.loggedSets.sessionId, schema.workoutSessions.id))
    .innerJoin(schema.exercises, eq(schema.loggedSets.exerciseId, schema.exercises.id))
    .leftJoin(schema.categories, eq(schema.exercises.categoryId, schema.categories.id))
    .where(
      and(
        isNotNull(schema.loggedSets.completedAt),
        ne(schema.workoutSessions.status, 'IN_PROGRESS'),
      ),
    )
    .orderBy(asc(schema.workoutSessions.startTime), asc(schema.loggedSets.id))
    .all();
}

export type BodyMeasurement = typeof schema.bodyMeasurements.$inferSelect;

export type MeasurementInput = {
  measuredOn: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  systolic: number | null;
  diastolic: number | null;
  notes: string | null;
};

export class MeasurementValidationError extends Error {}

const MEASURED_FIELDS = [
  'weightKg',
  'bodyFatPercent',
  'chestCm',
  'waistCm',
  'hipsCm',
  'armCm',
  'thighCm',
  'systolic',
  'diastolic',
] as const;

/**
 * Ciśnienie ma sens wyłącznie jako para. Pojedyncza liczba nic nie mówi, a odwrócona para
 * (rozkurczowe wyższe od skurczowego) to prawie zawsze pomyłka w przepisywaniu z ciśnieniomierza.
 */
function validatePressure(systolic: number | null, diastolic: number | null): void {
  if (systolic === null && diastolic === null) return;
  if (systolic === null || diastolic === null) {
    throw new MeasurementValidationError('Podaj obie wartości ciśnienia — skurczowe i rozkurczowe.');
  }
  if (systolic <= diastolic) {
    throw new MeasurementValidationError('Ciśnienie skurczowe musi być wyższe od rozkurczowego.');
  }
  // Zakres szeroki celowo: ma wyłapywać literówki, a nie oceniać, co jest zdrowe.
  if (systolic > 300 || diastolic > 200) {
    throw new MeasurementValidationError('Takie ciśnienie to pewnie literówka — sprawdź wpisane liczby.');
  }
}

/** Pomiary od najnowszego. */
export function listMeasurements(db: SyncDb): BodyMeasurement[] {
  return db
    .select()
    .from(schema.bodyMeasurements)
    .orderBy(desc(schema.bodyMeasurements.measuredOn), desc(schema.bodyMeasurements.id))
    .all();
}

/** Zapisuje pomiar; pomiar z tą samą datą jest nadpisywany. Zwraca id. */
export function saveMeasurement(db: SyncDb, input: MeasurementInput): number {
  if (MEASURED_FIELDS.every((field) => input[field] === null)) {
    throw new MeasurementValidationError('Podaj przynajmniej jedną wartość.');
  }
  for (const field of MEASURED_FIELDS) {
    const value = input[field];
    if (value !== null && value <= 0) throw new MeasurementValidationError('Wartości muszą być dodatnie.');
  }
  if (input.bodyFatPercent !== null && input.bodyFatPercent > 100) {
    throw new MeasurementValidationError('Poziom tkanki tłuszczowej nie może przekraczać 100%.');
  }
  validatePressure(input.systolic, input.diastolic);

  const values = { ...input, notes: input.notes?.trim() || null };
  return db.transaction((tx) => {
    const existing = tx
      .select({ id: schema.bodyMeasurements.id })
      .from(schema.bodyMeasurements)
      .where(eq(schema.bodyMeasurements.measuredOn, input.measuredOn))
      .get();
    if (existing) {
      tx.update(schema.bodyMeasurements).set(values).where(eq(schema.bodyMeasurements.id, existing.id)).run();
      return existing.id;
    }
    return tx
      .insert(schema.bodyMeasurements)
      .values(values)
      .returning({ id: schema.bodyMeasurements.id })
      .get().id;
  });
}

export function deleteMeasurement(db: SyncDb, id: number): void {
  db.delete(schema.bodyMeasurements).where(eq(schema.bodyMeasurements.id, id)).run();
}
