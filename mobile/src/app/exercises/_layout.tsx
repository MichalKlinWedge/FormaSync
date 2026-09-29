import { Stack } from 'expo-router';

export default function ExercisesLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="form" options={{ presentation: 'modal', title: 'Ćwiczenie' }} />
    </Stack>
  );
}
