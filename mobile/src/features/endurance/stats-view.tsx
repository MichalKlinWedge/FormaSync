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
import { SOURCE_LABELS, sportRecords } from './records';
import { loadEnduranceWorkouts, summarizeEndurance, weeklyVolume } from './stats';

/**
 * Statystyki biegania, roweru i pływania: tygodniowy dystans, najlepsze tempo, ostatnie treningi.
 * Przy „Różnych” wszystko przestawia się na czas — tańca ani tenisa nikt nie mierzy kilometrami,
 * a „0 km” i puste tempo wyglądałyby jak usterka.
 */
export function EnduranceStats({ sport }: { sport: Sport }) {
  const theme = useTheme();
  const workouts = useMemo(() => loadEnduranceWorkouts(db, sport), [sport]);
  const summary = useMemo(() => summarizeEndurance(workouts), [workouts]);
  const weeks = useMemo(() => weeklyVolume(workouts), [workouts]);
  const records = useMemo(() => sportRecords(workouts, sport), [workouts, sport]);

  if (workouts.length === 0) {
    return (
      <ThemedView style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          Statystyki pojawią się po pierwszym treningu z zapisanym odcinkiem.
        </ThemedText>
      </ThemedView>
    );
  }

  const byTime = sport === 'OTHER';
  const volume = (week: { meters: number; seconds: number }) => (byTime ? week.seconds : week.meters);
  const formatVolume = byTime ? formatSeconds : formatDistance;
  const maxVolume = Math.max(...weeks.map(volume), 1);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.stats}>
        <Stat label="Treningi" value={String(summary.workouts)} />
        {!byTime && <Stat label="Dystans" value={formatDistance(summary.meters)} />}
        <Stat label="Czas" value={formatSeconds(summary.seconds)} />
      </View>

      <View style={styles.group}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          REKORDY
        </ThemedText>
        {records.efforts.map((record) => (
          <Record
            key={record.meters}
            label={formatDistance(record.meters)}
            value={formatSeconds(record.seconds)}
            note={`${formatDate(record.startTime.slice(0, 10))} · ${SOURCE_LABELS[record.source]}`}
          />
        ))}
        {!byTime && records.longestDistance !== null && (
          <Record
            label="Najdłuższy dystans"
            value={formatDistance(records.longestDistance.value)}
            note={formatDate(records.longestDistance.startTime.slice(0, 10))}
          />
        )}
        {records.longestTime !== null && (
          <Record
            label="Najdłuższy trening"
            value={formatSeconds(records.longestTime.value)}
            note={formatDate(records.longestTime.startTime.slice(0, 10))}
          />
        )}
        {!byTime && records.bestPace !== null && (
          <Record
            label="Najlepsze tempo pracy"
            value={formatPace(records.bestPace.value)}
            note={formatDate(records.bestPace.startTime.slice(0, 10))}
          />
        )}
        {records.efforts.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            „Fragment treningu” to najszybszy odcinek o tej długości. „Średnia treningu” znaczy, że
            odcinków nie było — tak przychodzą treningi z zegarka — więc czas wyliczyliśmy z tempa
            całości.
          </ThemedText>
        )}
      </View>

      <View style={styles.group}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {byTime ? 'CZAS TYDZIEŃ PO TYGODNIU' : 'DYSTANS TYDZIEŃ PO TYGODNIU'}
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
                  { backgroundColor: theme.accent, width: `${(volume(week) / maxVolume) * 100}%` },
                ]}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.barValue}>
              {volume(week) > 0 ? formatVolume(volume(week)) : '—'}
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

/** Wiersz rekordu: co, ile, i kiedy padł — data i pochodzenie czasu drobnym drukiem. */
function Record({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={styles.recordRow}>
      <View style={styles.recordLabel}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
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
  recordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  recordLabel: { flex: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  barLabel: { width: 52 },
  barTrack: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 7 },
  barValue: { width: 64, textAlign: 'right' },
});
