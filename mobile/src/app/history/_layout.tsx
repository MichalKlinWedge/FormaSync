import { Stack } from 'expo-router';

export default function HistoryLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="progress" options={{ title: 'Statystyki' }} />
      <Stack.Screen name="body" options={{ title: 'Pomiary ciała' }} />
      <Stack.Screen name="update-plan" options={{ presentation: 'modal', title: 'Aktualizacja planu' }} />
    </Stack>
  );
}
