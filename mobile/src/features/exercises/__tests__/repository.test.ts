/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';

import {
  createQuickExercise,
  deleteExercise,
  type ExerciseInput,
  ExerciseInUseError,
  ExerciseValidationError,
  saveExercise,
} from '../repository';

function setup() {
  const db = createTestDb({ seed: true });
  const categories = db.select().from(schema.categories).all();
  const [primary, secondA, secondB] = categories;
  const input: ExerciseInput = {
    name: '  Moje ćwiczenie  ',
    categoryId: primary.id,
    secondaryCategoryIds: [secondA.id, secondB.id, primary.id],
    equipmentId: null,
    difficultyLevel: 'BEGINNER',
    trackingType: 'REPS',
    instructions: '1. Krok',
    techniqueNotes: '   ',
    imageUrl: null,
  };
  return { db, input, primary, secondA, secondB };
}

const musclesOf = (db: ReturnType<typeof createTestDb>, exerciseId: number) =>
  db
    .select({ id: schema.exerciseMuscles.categoryId })
    .from(schema.exerciseMuscles)
    .where(eq(schema.exerciseMuscles.exerciseId, exerciseId))
    .all()
    .map((r) => r.id)
    .sort();

describe('saveExercise', () => {
  it('tworzy własne ćwiczenie z oczyszczonymi danymi i partiami dodatkowymi', () => {
    const { db, input, secondA, secondB } = setup();
    const id = saveExercise(db, input);
    const row = db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get();

    expect(row).toMatchObject({ name: 'Moje ćwiczenie', isCustom: true, techniqueNotes: null });
    // Partia główna nie trafia do dodatkowych.
    expect(musclesOf(db, id)).toEqual([secondA.id, secondB.id].sort());
  });

  it('aktualizuje ćwiczenie i zastępuje partie dodatkowe', () => {
    const { db, input, secondB } = setup();
    const id = saveExercise(db, input);
    saveExercise(db, { ...input, name: 'Nowa nazwa', secondaryCategoryIds: [secondB.id] }, id);

    expect(db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get()?.name).toBe('Nowa nazwa');
    expect(musclesOf(db, id)).toEqual([secondB.id]);
  });

  it('odrzuca brak nazwy lub partii głównej', () => {
    const { db, input } = setup();
    expect(() => saveExercise(db, { ...input, name: ' ' })).toThrow(ExerciseValidationError);
    expect(() => saveExercise(db, { ...input, categoryId: null })).toThrow(ExerciseValidationError);
  });
});

describe('createQuickExercise', () => {
  it('zapisuje ćwiczenie z samą nazwą, bez partii i sprzętu', () => {
    const { db } = setup();
    const id = createQuickExercise(db, '  Maszyna przy oknie  ');

    expect(db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get()).toMatchObject({
      name: 'Maszyna przy oknie',
      isCustom: true,
      categoryId: null,
      equipmentId: null,
      trackingType: 'REPS',
    });
  });

  it('nie mnoży bliźniaków — ta sama nazwa wskazuje to samo ćwiczenie', () => {
    const { db } = setup();
    const first = createQuickExercise(db, 'Wiosło na linach');

    expect(createQuickExercise(db, 'wiosło NA linach')).toBe(first);
    expect(createQuickExercise(db, 'Przysiad ze sztangą')).toBe(
      db.select().from(schema.exercises).where(eq(schema.exercises.name, 'Przysiad ze sztangą')).get()!.id,
    );
  });

  it('wymaga nazwy', () => {
    const { db } = setup();
    expect(() => createQuickExercise(db, '   ')).toThrow(ExerciseValidationError);
  });
});

describe('deleteExercise', () => {
  it('usuwa nieużywane ćwiczenie razem z partiami dodatkowymi', () => {
    const { db, input } = setup();
    const id = saveExercise(db, input);
    deleteExercise(db, id);

    expect(db.select().from(schema.exercises).where(eq(schema.exercises.id, id)).get()).toBeUndefined();
    expect(musclesOf(db, id)).toEqual([]);
  });

  it('nie usuwa ćwiczenia używanego w planie', () => {
    const { db, input } = setup();
    const id = saveExercise(db, input);
    const plan = db.insert(schema.workoutPlans).values({ title: 'Plan' }).returning().get();
    db.insert(schema.planExercises).values({ planId: plan.id, exerciseId: id, orderIndex: 0, targetSets: 3 }).run();

    expect(() => deleteExercise(db, id)).toThrow(ExerciseInUseError);
  });
});
