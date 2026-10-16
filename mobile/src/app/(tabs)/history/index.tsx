import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';

import type { HistoryEntry } from '@/features/history/repository';
import { formatDistance, formatPace, paceFrom } from '@/features/endurance/format';
import { useHistory } from '@/features/history/use-history';
import { isEndurance } from '@/features/sports/sport';
import { SportSwitcher } from '@/features/sports/sport-switcher';
import { useActiveSport } from '@/features/sports/sport-store';
import { formatClock } from '@/features/workout/logic';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/date';
import { pluralWith } from '@/lib/number';

export default function HistoryScreen() {
  const sport = useActiveSport();
  const groups = useHistory(sport);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Historia</ThemedText>

          <SportSwitcher />

          {/* Dwa rzędy po dwa: w jednym wierszu dłuższe nazwy łamały się na trzy linijki
              i kafelki przestawały być równe. */}
          <View style={styles.tiles}>
            <View style={styles.actions}>
              <Tile icon="show_chart" label="Statystyki" href="/history/progress" />
              <Tile icon="watch" label="Z zegarka" href="/history/import" />
            </View>
            <View style={styles.actions}>
              <Tile icon="monitor_weight" label="Pomiary ciała" href="/history/body" />
              <Tile icon="water_drop" label="Woda i jedzenie" href="/history/daily" />
            </View>
          </View>

          {groups.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.empty}>
              <ThemedText type="small" themeColor="textSecondary">
                Tu pojawią się zakończone treningi. Rozpocznij pierwszy na ekranie „Dziś”.
              </ThemedText>
            </ThemedView>
          ) : (
            groups.map((group) => (
              <View key={group.label} style={styles.group}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {group.label.toUpperCase()}
                </ThemedText>
                {group.items.map((entry) => (
                  <HistoryRow key={entry.id} entry={entry} />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Tile({
  icon,
  label,
  href,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  href: Parameters<typeof router.push>[0];
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Icon name={icon} size={22} color={theme.accent} />
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const theme = useTheme();
  // Bieg opisuje dystans i tempo, siłę — serie i tonaż. Te same pola nic by nie powiedziały.
  const pace = isEndurance(entry.sport) ? paceFrom(entry.distanceMeters, entry.movingSeconds) : null;
  const details = [
    entry.durationSeconds !== null ? formatClock(entry.durationSeconds) : null,
    ...(isEndurance(entry.sport)
      ? [
          entry.distanceMeters > 0 ? formatDistance(entry.distanceMeters) : null,
          pace !== null ? formatPace(pace) : null,
        ]
      : [
          pluralWith(entry.completedSets, 'seria', 'serie', 'serii'),
          entry.tonnage > 0 ? `${Math.round(entry.tonnage)} kg` : null,
        ]),
    entry.rpeRating !== null ? `RPE ${entry.rpeRating}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/history/[id]', params: { id: entry.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {entry.title}
          {entry.status === 'ABANDONED' ? ' · przerwany' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDateTime(entry.startTime)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {details}
        </ThemedText>
      </View>
      <Icon name="chevron_right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  group: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
  empty: { borderRadius: 16, padding: Spacing.three },
  tiles: { gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 14,
    paddingVertical: Spacing.three,
  },
});
