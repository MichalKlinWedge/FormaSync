import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

import type { WatchActivity } from '@/features/health/activities';
import { importWatchActivity, listWatchActivities } from '@/features/health/activities';
import { HealthPermissionsError, HealthUnavailableError, HISTORY_DAYS } from '@/features/health/sync';
import { formatClock } from '@/features/workout/logic';
import { formatDateTime } from '@/lib/date';
import { formatNumber } from '@/lib/number';

/**
 * Wczytywanie treningów nagranych na zegarku. Garmin Connect zapisuje je do Health Connect,
 * skąd przychodzi czas i biometria — bez serii i powtórzeń, których Health Connect nie udostępnia.
 */
export default function ImportActivitiesScreen() {
  const [activities, setActivities] = useState<WatchActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listWatchActivities()
      .then((items) => {
        if (cancelled) return;
        setActivities(items);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setActivities([]);
        setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setActivities(null);
    setAttempt((value) => value + 1);
  };

  const add = (activity: WatchActivity) => {
    setBusy(true);
    try {
      const sessionId = importWatchActivity(activity);
      setActivities((current) => current?.filter((item) => item.recordId !== activity.recordId) ?? null);
      router.replace({ pathname: '/history/[id]', params: { id: sessionId } });
    } catch (e) {
      Alert.alert('Nie udało się dodać', e instanceof Error ? e.message : 'Nieznany błąd.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Treningi z ostatnich {HISTORY_DAYS} dni nagrane poza aplikacją. Przychodzi czas trwania, tętno
          i kalorie — serii i powtórzeń Health Connect nie udostępnia, więc liczy je tylko trening
          prowadzony w FormaSync.
        </ThemedText>

        {activities === null && (
          <View style={styles.busy}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Czytam z Health Connect…
            </ThemedText>
          </View>
        )}

        {error !== null && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small">{error}</ThemedText>
            <Button label="Spróbuj ponownie" icon="sync" variant="secondary" onPress={retry} />
          </ThemedView>
        )}

        {activities !== null && error === null && activities.length === 0 && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              Nie ma nic nowego do wczytania. Treningi, które już są w historii, pomijamy.
            </ThemedText>
          </ThemedView>
        )}

        {activities?.map((activity) => (
          <ThemedView key={activity.recordId} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{activity.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDateTime(activity.startTime)} · {formatClock(activity.durationSeconds)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {describeMetrics(activity)}
            </ThemedText>
            <Button
              label="Dodaj do historii"
              icon="add"
              variant="secondary"
              onPress={() => add(activity)}
              disabled={busy}
            />
          </ThemedView>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

function describeError(error: unknown): string {
  if (error instanceof HealthPermissionsError) {
    return 'Najpierw połącz aplikację z Health Connect w Ustawieniach.';
  }
  if (error instanceof HealthUnavailableError) return error.message;
  return error instanceof Error ? error.message : 'Nie udało się odczytać danych.';
}

function describeMetrics(activity: WatchActivity): string {
  const parts = [
    activity.avgHeartRate !== null ? `tętno śr. ${activity.avgHeartRate}` : null,
    activity.maxHeartRate !== null ? `maks. ${activity.maxHeartRate}` : null,
    activity.caloriesBurned !== null ? `${formatNumber(activity.caloriesBurned)} kcal` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Bez danych biometrycznych';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
