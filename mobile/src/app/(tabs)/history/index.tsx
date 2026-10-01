import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';

import type { HistoryEntry } from '@/features/history/repository';
import { useHistory } from '@/features/history/use-history';
import { formatClock } from '@/features/workout/logic';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/date';
import { pluralWith } from '@/lib/number';

export default function HistoryScreen() {
  const theme = useTheme();
  const groups = useHistory();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Historia</ThemedText>

          <View style={styles.actions}>
            <Pressable
              onPress={() => router.push('/history/progress')}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Icon name="show_chart" size={22} color={theme.accent} />
              <ThemedText type="smallBold">Statystyki</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => router.push('/history/body')}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Icon name="monitor_weight" size={22} color={theme.accent} />
              <ThemedText type="smallBold">Pomiary ciała</ThemedText>
            </Pressable>
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

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const theme = useTheme();
  const details = [
    entry.durationSeconds !== null ? formatClock(entry.durationSeconds) : null,
    pluralWith(entry.completedSets, 'seria', 'serie', 'serii'),
    entry.tonnage > 0 ? `${Math.round(entry.tonnage)} kg` : null,
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
  actions: { flexDirection: 'row', gap: Spacing.two },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 14,
    paddingVertical: Spacing.three,
  },
});
