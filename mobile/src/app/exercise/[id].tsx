import { useLocalSearchParams } from 'expo-router';

import { ExerciseDetails } from '@/features/exercises/details';

export default function ExerciseDescriptionScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  return <ExerciseDetails id={id} />;
}
