import { Stack } from 'expo-router';

export default function WorkoutLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="active" options={{ headerShown: false }} />
      <Stack.Screen name="finish" options={{ presentation: 'modal', title: 'Podsumowanie' }} />
      <Stack.Screen name="pick-exercise" options={{ presentation: 'modal', title: 'Dodaj ćwiczenia' }} />
    </Stack>
  );
}
