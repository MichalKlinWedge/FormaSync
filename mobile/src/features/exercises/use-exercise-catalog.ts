import { asc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { categories, equipment, exerciseMuscles, exercises } from '@/db/schema';

import type { ExerciseListItem } from './filter';

const collator = new Intl.Collator('pl');

/** Pełny katalog ćwiczeń (odświeżany na żywo), posortowany alfabetycznie po polsku. */
export function useExerciseCatalog(): ExerciseListItem[] {
  const { data: rows } = useLiveQuery(
    db
      .select({
        id: exercises.id,
        name: exercises.name,
        categoryId: exercises.categoryId,
        categoryName: categories.name,
        equipmentId: exercises.equipmentId,
        equipmentName: equipment.name,
        difficultyLevel: exercises.difficultyLevel,
        trackingType: exercises.trackingType,
        isCustom: exercises.isCustom,
        imageUrl: exercises.imageUrl,
      })
      .from(exercises)
      .leftJoin(categories, eq(exercises.categoryId, categories.id))
      .leftJoin(equipment, eq(exercises.equipmentId, equipment.id)),
  );
  const { data: muscles } = useLiveQuery(db.select().from(exerciseMuscles));

  return useMemo(() => {
    const secondary = new Map<number, number[]>();
    for (const m of muscles) {
      secondary.set(m.exerciseId, [...(secondary.get(m.exerciseId) ?? []), m.categoryId]);
    }
    return rows
      .map((r) => ({ ...r, secondaryCategoryIds: secondary.get(r.id) ?? [] }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [rows, muscles]);
}

/** Słowniki: partie mięśniowe i sprzęt. */
export function useDictionaries() {
  const { data: categoryList } = useLiveQuery(db.select().from(categories).orderBy(asc(categories.id)));
  const { data: equipmentList } = useLiveQuery(db.select().from(equipment).orderBy(asc(equipment.id)));
  return { categories: categoryList, equipment: equipmentList };
}
