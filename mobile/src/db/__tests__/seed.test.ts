/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { count, eq } from 'drizzle-orm';

import * as schema from '../schema';
import { seedDatabase } from '../seed';
import { seedExercises, seedTemplates } from '../seed-data';
import { createTestDb as createDb } from '../test-utils';

describe('seedDatabase', () => {
  it('wgrywa katalog ćwiczeń i szablony', () => {
    const db = createDb();
    expect(seedDatabase(db)).toBe(true);

    expect(db.select({ n: count() }).from(schema.exercises).get()?.n).toBe(seedExercises.length);
    const templates = db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.isTemplate, true)).all();
    expect(templates.map((t) => t.title).sort()).toEqual(seedTemplates.map((t) => t.title).sort());

    const expectedPlanRows = seedTemplates.reduce((n, t) => n + t.exercises.length, 0);
    expect(db.select({ n: count() }).from(schema.planExercises).get()?.n).toBe(expectedPlanRows);
  });

  it('jest idempotentne', () => {
    const db = createDb();
    seedDatabase(db);
    expect(seedDatabase(db)).toBe(false);
    expect(db.select({ n: count() }).from(schema.exercises).get()?.n).toBe(seedExercises.length);
  });

  it('nie dubluje rekordów przy ponownym seedzie po zmianie wersji', () => {
    const db = createDb();
    seedDatabase(db);
    db.update(schema.appSettings).set({ value: '0' }).where(eq(schema.appSettings.key, 'seed_version')).run();
    expect(seedDatabase(db)).toBe(true);
    expect(db.select({ n: count() }).from(schema.exercises).get()?.n).toBe(seedExercises.length);
    expect(db.select({ n: count() }).from(schema.workoutPlans).get()?.n).toBe(seedTemplates.length);
  });
});
