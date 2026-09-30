import { Stack } from 'expo-router';

export default function PlansLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="edit" options={{ title: 'Plan' }} />
      <Stack.Screen name="progression" options={{ presentation: 'modal', title: 'Sugestie progresji' }} />
      <Stack.Screen name="pick-exercise" options={{ presentation: 'modal', title: 'Dodaj ćwiczenia' }} />
    </Stack>
  );
}
