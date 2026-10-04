import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { syncWorkoutReminders } from '@/features/calendar/reminders';
import { deleteScheduled, type ScheduledEntry, type ScheduleStatus } from '@/features/calendar/repository';
import { groupByDay, useScheduledRange } from '@/features/calendar/use-calendar';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { ActiveSessionExistsError, startSession } from '@/features/workout/repository';
import { useTheme } from '@/hooks/use-theme';
import {
  addMonths,
  formatDayWithWeekday,
  fromDateKey,
  isSameMonth,
  monthGrid,
  monthTitle,
  todayKey,
  WEEKDAYS_SHORT,
} from '@/lib/date';

export default function CalendarScreen() {
  const theme = useTheme();
  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState(() => {
    const d = fromDateKey(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const weeks = monthGrid(view.year, view.month);
  const entries = useScheduledRange(weeks[0][0], weeks.at(-1)![6]);
  const byDay = groupByDay(entries);
  const selectedEntries = byDay.get(selected) ?? [];

  const statusColor = (status: ScheduleStatus) =>
    status === 'COMPLETED' ? theme.success : status === 'MISSED' ? theme.textSecondary : theme.accent;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Kalendarz</ThemedText>
            <Pressable
              accessibilityLabel="Zaplanuj trening"
              onPress={() => router.push({ pathname: '/calendar/schedule', params: { date: selected } })}
              hitSlop={8}>
              <Icon name="add" size={28} color={theme.accent} />
            </Pressable>
          </View>

          <View style={styles.monthBar}>
            <Pressable
              accessibilityLabel="Poprzedni miesiąc"
              onPress={() => setView((v) => addMonths(v.year, v.month, -1))}
              hitSlop={8}>
              <Icon name="chevron_left" size={26} color={theme.text} />
            </Pressable>
            <ThemedText type="smallBold">{monthTitle(view.year, view.month)}</ThemedText>
            <Pressable
              accessibilityLabel="Następny miesiąc"
              onPress={() => setView((v) => addMonths(v.year, v.month, 1))}
              hitSlop={8}>
              <Icon name="chevron_right" size={26} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.weekdays}>
            {WEEKDAYS_SHORT.map((day) => (
              <ThemedText key={day} type="small" themeColor="textSecondary" style={styles.weekdayCell}>
                {day}
              </ThemedText>
            ))}
          </View>

          <View style={styles.grid}>
            {weeks.map((week) => (
              <View key={week[0]} style={styles.week}>
                {week.map((key) => {
                  const dayEntries = byDay.get(key) ?? [];
                  const inMonth = isSameMonth(key, view.year, view.month);
                  const isSelected = key === selected;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setSelected(key)}
                      style={[
                        styles.dayCell,
                        isSelected && { backgroundColor: theme.backgroundSelected, borderRadius: 10 },
                        key === today && !isSelected && { borderColor: theme.accent, borderWidth: 1, borderRadius: 10 },
                      ]}>
                      <ThemedText
                        type="small"
                        themeColor={inMonth ? 'text' : 'textSecondary'}
                        style={!inMonth && styles.otherMonth}>
                        {fromDateKey(key).getDate()}
                      </ThemedText>
                      <View style={styles.dots}>
                        {dayEntries.slice(0, 3).map((entry) => (
                          <View
                            key={entry.id}
                            style={[styles.dot, { backgroundColor: statusColor(entry.status) }]}
                          />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.dayList}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {formatDayWithWeekday(selected).toUpperCase()}
            </ThemedText>
            {selectedEntries.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  Nic nie zaplanowano na ten dzień.
                </ThemedText>
              </ThemedView>
            ) : (
              selectedEntries.map((entry) => (
                <ScheduledRow key={entry.id} entry={entry} color={statusColor(entry.status)} />
              ))
            )}
            <Button
              label="Zaplanuj na ten dzień"
              icon="add"
              variant="secondary"
              onPress={() => router.push({ pathname: '/calendar/schedule', params: { date: selected } })}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  COMPLETED: 'wykonany',
  PLANNED: 'zaplanowany',
  MISSED: 'pominięty',
};

function ScheduledRow({ entry, color }: { entry: ScheduledEntry; color: string }) {
  const theme = useTheme();

  const begin = () => {
    try {
      startSession(db, { kind: 'scheduled', scheduledId: entry.id });
      void ensureNotificationPermission();
      router.push('/workout/active');
    } catch (e) {
      if (e instanceof ActiveSessionExistsError) {
        Alert.alert('Trening już trwa', 'Najpierw zakończ lub przerwij bieżący trening.');
      } else throw e;
    }
  };

  const confirmDelete = () =>
    Alert.alert('Usunąć z kalendarza?', entry.planTitle, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deleteScheduled(db, entry.id);
          void syncWorkoutReminders();
        },
      },
    ]);

  /** Wykonany termin prowadzi do zapisu w historii, niewykonany — do planu z listą ćwiczeń. */
  const openDetails = () =>
    entry.sessionId !== null
      ? router.push({ pathname: '/history/[id]', params: { id: entry.sessionId } })
      : router.push({ pathname: '/plans/[id]', params: { id: entry.planId } });

  return (
    <ThemedView type="backgroundElement" style={styles.entry}>
      <View style={[styles.statusBar, { backgroundColor: color }]} />
      <Pressable
        accessibilityLabel={`Szczegóły: ${entry.planTitle}`}
        onPress={openDetails}
        style={({ pressed }) => [styles.entryText, { opacity: pressed ? 0.7 : 1 }]}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {entry.planTitle}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {entry.scheduledTime ?? 'cały dzień'} · {STATUS_LABELS[entry.status]}
        </ThemedText>
      </Pressable>
      {!entry.isCompleted && (
        <Pressable accessibilityLabel="Rozpocznij trening" onPress={begin} hitSlop={6}>
          <Icon name="play_arrow" size={24} color={theme.accent} />
        </Pressable>
      )}
      <Pressable accessibilityLabel="Usuń termin" onPress={confirmDelete} hitSlop={6}>
        <Icon name="delete" size={20} color={theme.textSecondary} />
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: BottomTabInset + Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekdays: { flexDirection: 'row' },
  weekdayCell: { flex: 1, textAlign: 'center' },
  grid: { gap: Spacing.one },
  week: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, gap: Spacing.half },
  otherMonth: { opacity: 0.4 },
  dots: { flexDirection: 'row', gap: 2, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dayList: { gap: Spacing.two, marginTop: Spacing.two },
  card: { borderRadius: 14, padding: Spacing.three },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
    overflow: 'hidden',
  },
  statusBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  entryText: { flex: 1 },
});
