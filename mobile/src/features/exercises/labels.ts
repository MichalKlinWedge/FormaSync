import type { DifficultyLevel, TrackingType } from '@/db/schema';

export const difficultyLabels: Record<DifficultyLevel, string> = {
  BEGINNER: 'Początkujący',
  INTERMEDIATE: 'Średniozaawansowany',
  ADVANCED: 'Zaawansowany',
};

export const trackingTypeLabels: Record<TrackingType, string> = {
  REPS: 'Powtórzenia',
  TIME: 'Czas',
};
