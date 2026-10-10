import { Stack } from 'expo-router';

export default function HydrationLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Nawodnienie' }} />
      <Stack.Screen name="settings" options={{ title: 'Pilnowanie nawodnienia' }} />
    </Stack>
  );
}
