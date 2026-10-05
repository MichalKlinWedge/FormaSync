import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import type { Sport } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/date';
import { pluralWith } from '@/lib/number';

import { formatDistance, formatPace, formatSeconds } from './format';
import { loadEnduranceWorkouts, summarizeEndurance, weeklyVolume } from './stats';

/** Statystyki biegania, roweru i pływania: tygodniowy dystans, najlepsze tempo, ostatnie treningi. */
export function EnduranceStats({ sport }: { sport: Sport }) {
  const theme = useTheme();
  const workouts = useMemo(() => loadEnduranceWorkouts(db, sport), [sport]);
  const summary = useMemo(() => summarizeEndurance(workouts), [workouts]);
  const weeks = useMemo(() => weeklyVolume(workouts), [workouts]);

  if (workouts.length === 0) {
    return (
      <ThemedView style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          Statystyki pojawią się po pierwszym treningu z zapisanym odcinkiem.
        </ThemedText>
      </ThemedView>
    );
  }

  const maxMeters = Math.max(...weeks.map((week) => week.meters), 1);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.stats}>
        <Stat label="Treningi" value={String(summary.workouts)} />
        <Stat label="Dystans" value={formatDistance(summary.meters)} />
        <Stat label="Czas" value={formatSeconds(summary.seconds)} />
      </View>
      <View style={styles.stats}>
        <Stat
          label="Najlepsze tempo pracy"
          value={summary.bestPace === null ? '—' : formatPace(summary.bestPace)}
        />
        <Stat label="Najdłuższy" value={formatDistance(summary.longestMeters)} />
      </View>

      <View style={styles.group}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          DYSTANS TYDZIEŃ PO TYGODNIU
        </ThemedText>
        {weeks.map((week) => (
          <View key={week.weekKey} style={styles.barRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.barLabel}>
              {shortDay(week.weekKey)}
            </ThemedText>
            <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
              <View
                style={[
                  styles.barFill,
                  { backgroundColor: theme.accent, width: `${(week.meters / maxMeters) * 100}%` },
                ]}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.barValue}>
              {week.meters > 0 ? formatDistance(week.meters) : '—'}
            </ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.group}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          OSTATNIE TRENINGI
        </ThemedText>
        {workouts.slice(0, 10).map((workout) => (
          <ThemedView key={workout.sessionId} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {workout.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {[
                formatDate(workout.startTime.slice(0, 10)),
                workout.meters > 0 ? formatDistance(workout.meters) : null,
                workout.seconds > 0 ? formatSeconds(workout.seconds) : null,
                workout.pace === null ? null : `całość ${formatPace(workout.pace)}`,
                workout.workPace === null ? null : `praca ${formatPace(workout.workPace)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          </ThemedView>
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          Łącznie {pluralWith(summary.workouts, 'trening', 'treningi', 'treningów')} w tej dyscyplinie.
        </ThemedText>
      </View>
    </ScrollView>
  );
}

/** „2026-09-28” → „28.09”: krótko, bez skracanej nazwy miesiąca, która się nie mieści. */
function shortDay(dayKey: string): string {
  const [, month, day] = dayKey.split('-');
  return `${day}.${month}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="smallBold">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  empty: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.half },
  group: { gap: Spacing.two },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.half },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  barLabel: { width: 52 },
  barTrack: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 7 },
  barValue: { width: 64, textAlign: 'right' },
});
