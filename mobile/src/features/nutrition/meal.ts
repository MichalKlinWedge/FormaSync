import type { MealType } from '@/db/schema';

/** Nazwy posiłków i to, który z nich podsuwamy sami. */

export const MEAL_LABELS: Record<MealType, string> = {
  BREAKFAST: 'Śniadanie',
  LUNCH: 'Obiad',
  DINNER: 'Kolacja',
  SNACK: 'Przekąski',
};

/**
 * Domyślny posiłek po godzinie — w typowym przypadku nie trzeba wtedy niczego wybierać. Granice
 * są tam, gdzie zwykle się je: po dwudziestej drugiej to już przekąska, nie kolacja.
 */
export function mealByHour(at: Date): MealType {
  const hour = at.getHours();
  if (hour < 11) return 'BREAKFAST';
  if (hour < 16) return 'LUNCH';
  if (hour < 22) return 'DINNER';
  return 'SNACK';
}
