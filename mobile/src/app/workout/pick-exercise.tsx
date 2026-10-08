import { useState } from 'react';

import { db } from '@/db/client';
import { PickExerciseScreen } from '@/features/exercises/pick-exercise-screen';
import { addSessionExercise, findActiveSessionId } from '@/features/workout/repository';

/** Dodawanie ćwiczeń do trwającej sesji (także treningu rozpoczętego bez planu). */
export default function PickSessionExerciseScreen() {
  const [sessionId] = useState(() => findActiveSessionId(db));
  return (
    <PickExerciseScreen
      onConfirm={(exercises) => {
        if (sessionId === null) return;
        for (const exercise of exercises) addSessionExercise(db, sessionId, exercise.id);
      }}
    />
  );
}
