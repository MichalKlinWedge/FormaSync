import { useState } from 'react';

import { db } from '@/db/client';
import { createQuickExercise } from '@/features/exercises/repository';
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
      // Ćwiczenie spoza katalogu zapisujemy pod wpisaną nazwą i od razu dokładamy do treningu —
      // resztę opisu można uzupełnić później, bez przerywania serii.
      onCreate={(name) => {
        if (sessionId === null) return;
        addSessionExercise(db, sessionId, createQuickExercise(db, name));
      }}
    />
  );
}
