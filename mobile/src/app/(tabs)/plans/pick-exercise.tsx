import { db } from '@/db/client';
import { PickExerciseScreen } from '@/features/exercises/pick-exercise-screen';
import { addExercises } from '@/features/plans/draft';
import { usePlanDraftStore } from '@/features/plans/draft-store';
import { suggestedTarget } from '@/features/progress/repository';

/**
 * Wybór ćwiczeń dopisywanych do wersji roboczej planu w kolejności zaznaczania.
 *
 * Liczby dla nowej pozycji czytamy z historii tutaj, a nie w module wersji roboczej: ten zostaje
 * czysty, bez wiedzy o bazie, i daje się sprawdzać testem bez telefonu.
 */
export default function PickPlanExerciseScreen() {
  const apply = usePlanDraftStore((s) => s.apply);
  // Ten ekran żyje pod zakładkami, więc pasek nawigacji jest już przez nie zasłonięty.
  return (
    <PickExerciseScreen
      safeBottom={false}
      onConfirm={(exercises) =>
        apply((draft) =>
          addExercises(draft, exercises, (exercise) =>
            suggestedTarget(db, exercise.id, exercise.trackingType),
          ),
        )
      }
    />
  );
}
