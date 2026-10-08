import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { BarChart } from '@/components/charts/bar-chart';
import { LineChart } from '@/components/charts/line-chart';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ExerciseLink } from '@/features/exercises/exercise-link';
import {
  exerciseProgress,
  overallStats,
  personalRecords,
  tonnageByCategory,
  trackedExercises,
  weeklyTonnage,
} from '@/features/progress/analytics';
import { useCompletedSets } from '@/features/progress/use-progress';
import { EnduranceStats } from '@/features/endurance/stats-view';
import { isEndurance } from '@/features/sports/sport';
import { useActiveSport } from '@/features/sports/sport-store';
import { useTheme } from '@/hooks/use-theme';
import { addDays, fromDateKey, todayKey } from '@/lib/date';
import { formatKg, formatNumber, formatTonnage } from '@/lib/number';

const WEEKS = 12;
const CATEGORY_WINDOW_DAYS = 28;

export default function ProgressScreen() {
  const theme = useTheme();
  const sport = useActiveSport();
  const sets = useCompletedSets();
  const today = todayKey();

  const stats = useMemo(() => overallStats(sets), [sets]);
  const weeks = useMemo(() => weeklyTonnage(sets, WEEKS, today), [sets, today]);
  const categories = useMemo(
    () => tonnageByCategory(sets, addDays(today, -CATEGORY_WINDOW_DAYS)),
    [sets, today],
  );
  const exercises = useMemo(() => trackedExercises(sets), [sets]);
  const records = useMemo(() => personalRecords(sets), [sets]);

  const [selectedExercise, setSelectedExercise] = useState<number | null>(null);
  const exerciseId = selectedExercise ?? exercises[0]?.id ?? null;
  const progress = useMemo(
    () => (exerciseId === null ? [] : exerciseProgress(sets, exerciseId)),
    [sets, exerciseId],
  );

  const maxCategory = categories[0]?.tonnage ?? 0;

  // Tonaż i rekordy ciężaru nie opisują biegu — wytrzymałość ma własne liczby.
  if (isEndurance(sport)) return <EnduranceStats sport={sport} />;

  if (sets.length === 0) {
    return (
      <ThemedView style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          Statystyki pojawią się po pierwszym zapisanym treningu.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.stats}>
          <Stat label="Treningów" value={formatNumber(stats.sessions)} />
          <Stat label="Serii" value={formatNumber(stats.sets)} />
          <Stat label="Tonaż" value={formatTonnage(stats.tonnage)} />
        </View>

        <Section title="Tonaż tygodniowy" hint={`Ostatnie ${WEEKS} tygodni`}>
          <BarChart
            data={weeks.map((week) => ({ label: weekLabel(week.weekStart), value: week.tonnage }))}
            formatValue={formatTonnage}
            emptyMessage="Brak zapisanego tonażu w tym okresie."
          />
        </Section>

        <Section title="Partie mięśniowe" hint={`Ostatnie ${CATEGORY_WINDOW_DAYS} dni`}>
          {categories.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Brak danych z ostatnich tygodni.
            </ThemedText>
          ) : (
            categories.map((category) => (
              <View key={category.name} style={styles.categoryRow}>
                <ThemedText type="small" style={styles.categoryName} numberOfLines={1}>
                  {category.name}
                </ThemedText>
                <View style={styles.categoryTrack}>
                  <View
                    style={[
                      styles.categoryBar,
                      {
                        backgroundColor: theme.chart1,
                        width: `${Math.max((category.tonnage / maxCategory) * 100, 2)}%`,
                      },
                    ]}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.categoryValue}>
                  {formatTonnage(category.tonnage)}
                </ThemedText>
              </View>
            ))
          )}
        </Section>

        {exercises.length > 0 && exerciseId !== null && (
          <Section title="Progresja ćwiczenia" hint="Najcięższa seria i szacowany rekord (wzór Epleya)">
            <View style={styles.chips}>
              {exercises.slice(0, 8).map((exercise) => (
                <Chip
                  key={exercise.id}
                  label={exercise.name}
                  selected={exercise.id === exerciseId}
                  onPress={() => setSelectedExercise(exercise.id)}
                />
              ))}
            </View>
            <LineChart
              labels={progress.map((point) => shortDate(point.date))}
              series={[
                {
                  name: 'Najcięższa seria',
                  color: theme.chart1,
                  values: progress.map((point) => point.topWeight),
                },
                {
                  name: 'Szacowany rekord',
                  color: theme.chart2,
                  values: progress.map((point) => (point.oneRepMax === null ? null : Math.round(point.oneRepMax))),
                },
              ]}
              formatValue={(value) => formatNumber(value)}
              emptyMessage="Potrzebne są co najmniej dwa dni treningowe z tym ćwiczeniem."
            />
            {progress.length > 0 && (
              <View style={styles.tableRows}>
                {progress
                  .slice(-5)
                  .reverse()
                  .map((point) => (
                    <View key={point.date} style={styles.tableRow}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {shortDate(point.date)}
                      </ThemedText>
                      <ThemedText type="small">
                        {point.topWeight !== null ? formatKg(point.topWeight) : '–'}
                        {point.bestSetReps ? ` × ${point.bestSetReps}` : ''}
                      </ThemedText>
                    </View>
                  ))}
              </View>
            )}
          </Section>
        )}

        <Section title="Rekordy osobiste">
          <Button
            label="Kalkulator 1RM"
            icon="calculate"
            variant="secondary"
            onPress={() => router.push('/history/one-rep-max')}
          />
          {records.slice(0, 10).map((record) => (
            <View key={record.exerciseId} style={styles.tableRow}>
              <View style={styles.recordName}>
                <ExerciseLink
                  exerciseId={record.exerciseId}
                  name={record.exerciseName}
                  withName
                  textType="small"
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {formatKg(record.maxWeight)}
                {record.maxWeightReps ? ` × ${record.maxWeightReps}` : ''}
                {record.bestOneRepMax ? ` · 1RM ≈ ${formatKg(Math.round(record.bestOneRepMax))}` : ''}
              </ThemedText>
            </View>
          ))}
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

/** Etykieta osi: dzień i miesiąc początku tygodnia, np. „28.09”. */
function weekLabel(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const shortDate = weekLabel;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title.toUpperCase()}
        </ThemedText>
        {hint && (
          <ThemedText type="small" themeColor="textSecondary">
            {hint}
          </ThemedText>
        )}
      </View>
      {children}
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
  flex: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.half },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  categoryName: { width: 110 },
  categoryTrack: { flex: 1, height: 8 },
  categoryBar: { height: 8, borderRadius: 4 },
  categoryValue: { width: 58, textAlign: 'right' },
  tableRows: { gap: Spacing.half },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  recordName: { flex: 1 },
});
