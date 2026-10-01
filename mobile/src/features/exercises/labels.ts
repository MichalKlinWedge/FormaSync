import type { DifficultyLevel, TrackingType } from '@/db/schema';

export const difficultyLabels: Record<DifficultyLevel, string> = {
  BEGINNER: 'Początkujący',
  INTERMEDIATE: 'Średniozaawansowany',
  ADVANCED: 'Zaawansowany',
};

/** Skrót do ciasnych wierszy listy — pełna nazwa nie mieści się obok partii i sprzętu. */
export const difficultyShortLabels: Record<DifficultyLevel, string> = {
  BEGINNER: 'początkujący',
  INTERMEDIATE: 'średni',
  ADVANCED: 'zaawansowany',
};

export const trackingTypeLabels: Record<TrackingType, string> = {
  REPS: 'Powtórzenia',
  TIME: 'Czas',
};
