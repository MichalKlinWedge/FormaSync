import { Stack } from 'expo-router';

export default function CalendarLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="schedule" options={{ presentation: 'modal', title: 'Zaplanuj trening' }} />
      <Stack.Screen name="details" options={{ title: '' }} />
      <Stack.Screen name="update-plan" options={{ presentation: 'modal', title: 'Aktualizacja planu' }} />
    </Stack>
  );
}
