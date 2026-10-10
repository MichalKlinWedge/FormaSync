import { Stack, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';

import { db } from '@/db/client';
import { PickExerciseScreen } from '@/features/exercises/pick-exercise-screen';
import { swapSessionExercise } from '@/features/workout/repository';

/**
 * Podmiana ćwiczenia w zapisanym treningu. Trasa jest poza zakładkami, bo ekran treningu żyje
 * i w historii, i w kalendarzu — wspólny stos zakładek przerzuciłby „wstecz” do cudzej gałęzi.
 */
export default function SwapExerciseScreen() {
  const params = useLocalSearchParams<{ id?: string; tracking?: string }>();
  const sessionExerciseId = params.id === undefined ? null : Number(params.id);

  return (
    <>
      <Stack.Screen options={{ title: 'Zamień ćwiczenie' }} />
      <PickExerciseScreen
        single
        onConfirm={([exercise]) => {
          if (sessionExerciseId === null || !exercise) return;
          swapSessionExercise(db, sessionExerciseId, exercise.id);
          // Serie zostają takie, jakie były: zapis czasu nie zamieni się sam w powtórzenia.
          // Lepiej powiedzieć to wprost, niż zostawić puste pola i wrażenie, że dane przepadły.
          if (params.tracking !== undefined && params.tracking !== exercise.trackingType) {
            Alert.alert(
              'Zamienione',
              exercise.trackingType === 'REPS'
                ? 'Nowe ćwiczenie liczy powtórzenia, a zapisane serie mają czas. Wartości zostały na miejscu — wpisz powtórzenia albo zamień z powrotem.'
                : 'Nowe ćwiczenie liczy czas, a zapisane serie mają powtórzenia. Wartości zostały na miejscu — wpisz czas albo zamień z powrotem.',
            );
          }
        }}
      />
    </>
  );
}
