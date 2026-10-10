import { Stack } from 'expo-router';

export default function GoalLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Cele' }} />
      <Stack.Screen name="new" options={{ title: 'Nowy cel' }} />
      <Stack.Screen name="[id]" options={{ title: 'Plan pod cel' }} />
      <Stack.Screen name="ai" options={{ title: 'Planista AI' }} />
    </Stack>
  );
}
