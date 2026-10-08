import { Stack } from 'expo-router';

/**
 * Opis ćwiczenia otwierany z planu, treningu czy historii. Żyje poza zakładkami, żeby „wstecz”
 * wracało tam, skąd się weszło — trasa w katalogu przełączałaby zakładkę i gubiła to miejsce.
 */
export default function ExerciseLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
