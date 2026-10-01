import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { garminActivityMetrics, garminDailyHealth } from '@/db/schema';
import { toDateKey } from '@/lib/date';
import { formatNumber } from '@/lib/number';

import { loadSessionHealth } from './repository';

type SessionHealthProps = { sessionId: number; startTime: string };

/** Dane zdrowotne powiązane z treningiem: metryki sesji i podsumowanie dnia. */
export function SessionHealth({ sessionId, startTime }: SessionHealthProps) {
  // Obserwujemy tabele, żeby po pobraniu danych widok odświeżył się bez wychodzenia z ekranu.
  const { data: activitySignal } = useLiveQuery(
    db.select({ id: garminActivityMetrics.id }).from(garminActivityMetrics),
  );
  const { data: dailySignal } = useLiveQuery(db.select({ id: garminDailyHealth.id }).from(garminDailyHealth));
  void activitySignal;
  void dailySignal;

  const { activity, daily } = loadSessionHealth(db, sessionId, toDateKey(new Date(startTime)));
  if (!activity && !daily) return null;

  const rows: { label: string; value: string }[] = [];
  if (activity?.avgHeartRate) rows.push({ label: 'Tętno średnie', value: `${activity.avgHeartRate} bpm` });
  if (activity?.maxHeartRate) rows.push({ label: 'Tętno maksymalne', value: `${activity.maxHeartRate} bpm` });
  if (activity?.caloriesBurned)
    rows.push({ label: 'Kalorie treningu', value: `${formatNumber(activity.caloriesBurned)} kcal` });
  if (daily?.restingHeartRate)
    rows.push({ label: 'Tętno spoczynkowe', value: `${daily.restingHeartRate} bpm` });
  if (daily?.hrvAvgMs) rows.push({ label: 'Zmienność rytmu serca', value: `${daily.hrvAvgMs} ms` });
  if (daily?.sleepDurationMinutes)
    rows.push({ label: 'Sen', value: formatSleep(daily.sleepDurationMinutes) });
  if (daily?.bloodPressureSystolic && daily.bloodPressureDiastolic)
    rows.push({
      label: 'Ciśnienie',
      value: `${daily.bloodPressureSystolic}/${daily.bloodPressureDiastolic} mmHg`,
    });

  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        DANE ZDROWOTNE
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary">
              {row.label}
            </ThemedText>
            <ThemedText type="small">{row.value}</ThemedText>
          </View>
        ))}
      </ThemedView>
    </View>
  );
}

const formatSleep = (minutes: number) => `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
});
