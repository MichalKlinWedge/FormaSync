import { PickExerciseScreen } from '@/features/exercises/pick-exercise-screen';
import { addExercises } from '@/features/plans/draft';
import { usePlanDraftStore } from '@/features/plans/draft-store';

/** Wybór ćwiczeń dopisywanych do wersji roboczej planu w kolejności zaznaczania. */
export default function PickPlanExerciseScreen() {
  const apply = usePlanDraftStore((s) => s.apply);
  // Ten ekran żyje pod zakładkami, więc pasek nawigacji jest już przez nie zasłonięty.
  return (
    <PickExerciseScreen
      safeBottom={false}
      onConfirm={(exercises) => apply((d) => addExercises(d, exercises))}
    />
  );
}
