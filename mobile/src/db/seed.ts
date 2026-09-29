import { eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import * as schema from './schema';
import {
  SEED_VERSION,
  seedCategories,
  seedEquipment,
  seedExercises,
  seedTemplates,
} from './seed-data';

// Synchroniczna baza Drizzle/SQLite (expo-sqlite w aplikacji, better-sqlite3 w testach).
// Sterownik expo-sqlite jest synchroniczny — w transakcji używamy .all()/.get()/.run(),
// bo `await` na zapytaniu wykonałby je dopiero po COMMIT.
export type SyncDb = BaseSQLiteDatabase<'sync', unknown, typeof schema>;

const SEED_VERSION_KEY = 'seed_version';

/**
 * Wgrywa słowniki, katalog ćwiczeń i szablony. Idempotentne: rekordy dopasowywane po nazwie,
 * więc podbicie SEED_VERSION dogrywa tylko brakujące pozycje, nie ruszając danych użytkownika.
 */
export function seedDatabase(db: SyncDb): boolean {
  const current = db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, SEED_VERSION_KEY))
    .get();
  if (Number(current?.value ?? 0) >= SEED_VERSION) return false;

  db.transaction((tx) => {
    const categoryIds = new Map(
      tx.select().from(schema.categories).all().map((c) => [c.name, c.id]),
    );
    for (const c of seedCategories) {
      if (categoryIds.has(c.name)) continue;
      const row = tx.insert(schema.categories).values(c).returning({ id: schema.categories.id })
        .get();
      categoryIds.set(c.name, row.id);
    }

    const equipmentIds = new Map(
      tx.select().from(schema.equipment).all().map((e) => [e.name, e.id]),
    );
    for (const name of seedEquipment) {
      if (equipmentIds.has(name)) continue;
      const row = tx.insert(schema.equipment).values({ name }).returning({ id: schema.equipment.id })
        .get();
      equipmentIds.set(name, row.id);
    }

    const exerciseIds = new Map(
      tx
        .select({ id: schema.exercises.id, name: schema.exercises.name })
        .from(schema.exercises)
        .all()
        .map((e) => [e.name, e.id]),
    );
    for (const e of seedExercises) {
      if (exerciseIds.has(e.name)) continue;
      const row = tx
        .insert(schema.exercises)
        .values({
          name: e.name,
          categoryId: requireId(categoryIds, e.category),
          equipmentId: requireId(equipmentIds, e.equipment),
          difficultyLevel: e.difficulty,
          trackingType: e.tracking ?? 'REPS',
          instructions: e.instructions.map((step, i) => `${i + 1}. ${step}`).join('\n'),
          techniqueNotes: e.technique ?? null,
          garminCategory: e.garminCategory ?? null,
        })
        .returning({ id: schema.exercises.id })
        .get();
      exerciseIds.set(e.name, row.id);
      for (const muscle of e.secondary ?? []) {
        tx
          .insert(schema.exerciseMuscles)
          .values({ exerciseId: row.id, categoryId: requireId(categoryIds, muscle) })
          .run();
      }
    }

    const existingTemplates = new Set(
      tx
        .select({ title: schema.workoutPlans.title })
        .from(schema.workoutPlans)
        .where(eq(schema.workoutPlans.isTemplate, true))
        .all()
        .map((t) => t.title),
    );
    for (const t of seedTemplates) {
      if (existingTemplates.has(t.title)) continue;
      const plan = tx
        .insert(schema.workoutPlans)
        .values({ title: t.title, description: t.description, isTemplate: true })
        .returning({ id: schema.workoutPlans.id })
        .get();
      tx.insert(schema.planExercises)
        .values(
        t.exercises.map((pe, i) => ({
          planId: plan.id,
          exerciseId: requireId(exerciseIds, pe.exercise),
          orderIndex: i,
          targetSets: pe.sets,
          targetReps: pe.reps ?? null,
          targetDurationSeconds: pe.durationSeconds ?? null,
          restDurationSeconds: pe.rest,
        })),
        )
        .run();
    }

    tx.insert(schema.appSettings)
      .values({ key: SEED_VERSION_KEY, value: String(SEED_VERSION) })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: String(SEED_VERSION) } })
      .run();
  });
  return true;
}

function requireId(map: Map<string, number>, name: string): number {
  const id = map.get(name);
  if (id === undefined) throw new Error(`Seed: nieznany klucz „${name}”`);
  return id;
}
