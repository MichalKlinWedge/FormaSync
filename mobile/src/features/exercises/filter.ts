import type { DifficultyLevel, TrackingType } from '@/db/schema';

export type ExerciseListItem = {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  equipmentId: number | null;
  equipmentName: string | null;
  difficultyLevel: DifficultyLevel | null;
  trackingType: TrackingType;
  isCustom: boolean;
  imageUrl: string | null;
  /** Dodatkowe partie mięśniowe (exercise_muscles). */
  secondaryCategoryIds: number[];
};

export type ExerciseFilter = {
  search: string;
  categoryIds: number[];
  equipmentIds: number[];
  difficultyLevels: DifficultyLevel[];
};

export const emptyExerciseFilter: ExerciseFilter = {
  search: '',
  categoryIds: [],
  equipmentIds: [],
  difficultyLevels: [],
};

export function isFilterActive(filter: ExerciseFilter): boolean {
  return (
    filter.search.trim() !== '' ||
    filter.categoryIds.length > 0 ||
    filter.equipmentIds.length > 0 ||
    filter.difficultyLevels.length > 0
  );
}

/** Małe litery bez polskich znaków diakrytycznych — wyszukiwanie „laweczka” znajdzie „ławeczka”. */
export function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase('pl')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * W obrębie jednego rodzaju filtra wartości łączone są przez LUB, między rodzajami przez I.
 * Filtr partii mięśniowej uwzględnia zarówno partię główną, jak i dodatkowe.
 * Wyszukiwanie: każde słowo zapytania musi wystąpić w nazwie.
 */
export function filterExercises(items: ExerciseListItem[], filter: ExerciseFilter): ExerciseListItem[] {
  const words = normalizeText(filter.search).split(/\s+/).filter(Boolean);
  const categories = new Set(filter.categoryIds);
  const equipment = new Set(filter.equipmentIds);
  const levels = new Set(filter.difficultyLevels);

  return items.filter((item) => {
    if (words.length > 0) {
      const name = normalizeText(item.name);
      if (!words.every((w) => name.includes(w))) return false;
    }
    if (categories.size > 0) {
      const matches =
        (item.categoryId !== null && categories.has(item.categoryId)) ||
        item.secondaryCategoryIds.some((id) => categories.has(id));
      if (!matches) return false;
    }
    if (equipment.size > 0 && (item.equipmentId === null || !equipment.has(item.equipmentId))) return false;
    if (levels.size > 0 && (item.difficultyLevel === null || !levels.has(item.difficultyLevel))) return false;
    return true;
  });
}

export function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
