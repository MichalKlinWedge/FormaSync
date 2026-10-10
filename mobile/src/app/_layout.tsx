import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { DatabaseProvider } from '@/components/database-provider';

SplashScreen.preventAutoHideAsync();

/**
 * Korzeniem jest stos, a nie zakładki: ekran treningu na żywo musi dać się otworzyć
 * ponad zakładkami. Gdyby zakładki były korzeniem, trasy spoza nich byłyby nieosiągalne.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <DatabaseProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="workout" />
          <Stack.Screen name="exercise" />
          <Stack.Screen name="hydration" />
          <Stack.Screen name="settings" />
        </Stack>
      </DatabaseProvider>
    </ThemeProvider>
  );
}
