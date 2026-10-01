import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Ustawienia' }} />
      <Stack.Screen name="privacy" options={{ title: 'Prywatność' }} />
    </Stack>
  );
}
