import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SplashScreen from 'expo-splash-screen';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { seedDatabase } from '@/db/seed';
import { syncWorkoutReminders } from '@/features/calendar/reminders';
import { useSportStore } from '@/features/sports/sport-store';
import migrations from '../../drizzle/migrations';

type InitState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: Error };

// Jedna inicjalizacja na proces (odporna na podwójne efekty w StrictMode).
let initPromise: Promise<void> | null = null;
function initDatabase() {
  initPromise ??= migrate(db, migrations).then(() => {
    seedDatabase(db);
    useSportStore.getState().hydrate();
    // Android kasuje zaplanowane alarmy przy aktualizacji aplikacji — odtwarzamy je przy starcie.
    // Ewentualny błąd powiadomień nie może zablokować uruchomienia aplikacji.
    void syncWorkoutReminders().catch(() => {});
  });
  return initPromise;
}

// Uruchamia migracje i seed przed wyrenderowaniem aplikacji.
export function DatabaseProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<InitState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    initDatabase()
      .then(() => !cancelled && setState({ status: 'ready' }))
      .catch((error: Error) => !cancelled && setState({ status: 'error', error }))
      .finally(() => SplashScreen.hideAsync());
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'error') {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="smallBold">Błąd inicjalizacji bazy danych</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {state.error.message}
        </ThemedText>
      </ThemedView>
    );
  }
  if (state.status === 'loading') {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }
  return children;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
});
