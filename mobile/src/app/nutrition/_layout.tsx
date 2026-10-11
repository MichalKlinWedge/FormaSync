import { Stack } from 'expo-router';

export default function NutritionLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Kalorie' }} />
      <Stack.Screen name="add" options={{ title: 'Dodaj posiłek' }} />
      <Stack.Screen name="describe" options={{ title: 'Opisz posiłek' }} />
      <Stack.Screen name="foods" options={{ title: 'Baza produktów' }} />
      <Stack.Screen name="food" options={{ title: 'Produkt' }} />
      <Stack.Screen name="settings" options={{ title: 'Cel diety' }} />
    </Stack>
  );
}
