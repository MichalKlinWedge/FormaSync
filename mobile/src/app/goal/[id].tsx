import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { syncWorkoutReminders } from '@/features/calendar/reminders';
import { formatDistance, formatPace, formatSeconds } from '@/features/endurance/format';
import { buildBrief } from '@/features/goals/brief';
import { planGoal } from '@/features/goals/planner';
import { deleteGoal, materializeGoal, savePlan, setGoalStatus } from '@/features/goals/repository';
import { KIND_LABELS, PHASE_LABELS } from '@/features/goals/shapes';
import { useGoal, weeksLeft } from '@/features/goals/use-goals';
import { SPORT_LABELS } from '@/features/sports/sport';
import { formatDate, todayKey } from '@/lib/date';
import { pluralWith } from '@/lib/number';

const REMINDERS: { label: string; minutes: number | null }[] = [
  { label: 'bez przypomnienia', minutes: null },
  { label: '30 min', minutes: 30 },
  { label: '1 godz.', minutes: 60 },
  { label: 'dzień wcześniej', minutes: 24 * 60 },
];

const TIMES = ['06:00', '07:00', '17:00', '18:00'];

export default function GoalScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const goalId = Number(params.id);
  const { goal, workouts, progress } = useGoal(goalId);
  const [time, setTime] = useState<string | null>('07:00');
  const [reminder, setReminder] = useState<number | null>(60);

  if (goal === null) {
    return (
      <ThemedView style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          Tego celu już nie ma.
        </ThemedText>
      </ThemedView>
    );
  }

  const left = weeksLeft(goal);

  const plan = () => {
    const weeks = planGoal(buildBrief(db, goal), todayKey());
    if (weeks.length === 0) {
      Alert.alert('Nie ma czego planować', 'Termin zawodów już minął albo dystans jest zerowy.');
      return;
    }
    const added = savePlan(db, goalId, weeks, 'RULES');
    Alert.alert(
      'Plan gotowy',
      `${pluralWith(weeks.length, 'tydzień', 'tygodnie', 'tygodni')}, ${pluralWith(added, 'jednostka', 'jednostki', 'jednostek')}. Przejrzyj go niżej i wpisz do kalendarza.`,
    );
  };

  const materialize = () => {
    const written = materializeGoal(db, goalId, {
      scheduledTime: time,
      reminderOffsetMinutes: reminder,
    });
    void syncWorkoutReminders();
    Alert.alert(
      written === 0 ? 'Nic nie doszło' : 'Wpisane do kalendarza',
      written === 0
        ? 'Wszystkie jednostki z przyszłości są już w kalendarzu.'
        : `Dodane terminy: ${written}.`,
    );
  };

  const remove = () =>
    Alert.alert('Usunąć cel?', 'Plan zniknie. Terminy już wpisane do kalendarza zostaną.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deleteGoal(db, goalId);
          router.back();
        },
      },
    ]);

  // Jednostki grupujemy po tygodniu dopiero tutaj: w bazie leżą płasko, po dacie.
  const weeks = [...new Set(workouts.map((workout) => workout.weekIndex))].sort((a, b) => a - b);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="subtitle">{goal.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {[
              SPORT_LABELS[goal.sport],
              formatDistance(goal.distanceMeters),
              formatDate(goal.eventDate),
              goal.targetSeconds === null ? null : `cel ${formatSeconds(goal.targetSeconds)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {left === 0
              ? 'Termin już minął.'
              : `Zostało ${pluralWith(left, 'tydzień', 'tygodnie', 'tygodni')}.`}
          </ThemedText>
        </View>

        {workouts.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              POSTĘP
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {`Jednostek w planie ${progress.planned}, w kalendarzu ${progress.scheduled}, zrobionych ${progress.done}.`}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {`Dystans: ${formatDistance(progress.doneMeters)} z ${formatDistance(progress.plannedMeters)}.`}
            </ThemedText>
          </View>
        )}

        <View style={styles.section}>
          <Button
            label={workouts.length === 0 ? 'Ułóż plan' : 'Przelicz plan od nowa'}
            icon="auto_awesome"
            onPress={plan}
          />
          {workouts.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Przeliczenie zostawia jednostki już wpisane do kalendarza i układa resztę od nowa —
              przydaje się po chorobie albo po zmianie dni treningowych.
            </ThemedText>
          )}
        </View>

        {workouts.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              GODZINA I PRZYPOMNIENIE
            </ThemedText>
            <View style={styles.chips}>
              {TIMES.map((item) => (
                <Chip key={item} label={item} selected={time === item} onPress={() => setTime(item)} />
              ))}
              <Chip label="bez godziny" selected={time === null} onPress={() => setTime(null)} />
            </View>
            <View style={styles.chips}>
              {REMINDERS.map((item) => (
                <Chip
                  key={item.label}
                  label={item.label}
                  selected={reminder === item.minutes}
                  onPress={() => setReminder(item.minutes)}
                />
              ))}
            </View>
            <Button label="Wpisz do kalendarza" icon="event_available" onPress={materialize} />
          </View>
        )}

        {weeks.map((weekIndex) => {
          const inWeek = workouts.filter((workout) => workout.weekIndex === weekIndex);
          const meters = inWeek.reduce((sum, workout) => sum + (workout.distanceMeters ?? 0), 0);
          return (
            <View key={weekIndex} style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {`TYDZIEŃ ${weekIndex + 1} · ${PHASE_LABELS[inWeek[0].phase].toUpperCase()} · ${formatDistance(meters)}`}
              </ThemedText>
              {inWeek.map((workout) => (
                <View key={workout.id} style={styles.workout}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.date}>
                    {formatDate(workout.plannedDate).slice(0, 5)}
                  </ThemedText>
                  <View style={styles.rowText}>
                    <ThemedText type="small">{workout.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[
                        KIND_LABELS[workout.kind],
                        workout.paceSeconds === null ? null : formatPace(workout.paceSeconds),
                        workout.durationSeconds === null ? null : formatSeconds(workout.durationSeconds),
                        workout.scheduledId === null ? null : 'w kalendarzu',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          );
        })}

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            STAN CELU
          </ThemedText>
          <View style={styles.chips}>
            <Chip
              label="W toku"
              selected={goal.status === 'ACTIVE'}
              onPress={() => setGoalStatus(db, goalId, 'ACTIVE')}
            />
            <Chip
              label="Dowieziony"
              selected={goal.status === 'DONE'}
              onPress={() => setGoalStatus(db, goalId, 'DONE')}
            />
            <Chip
              label="Porzucony"
              selected={goal.status === 'ABANDONED'}
              onPress={() => setGoalStatus(db, goalId, 'ABANDONED')}
            />
          </View>
          <Button label="Usuń cel" icon="delete" variant="danger" onPress={remove} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  workout: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  date: { width: 44 },
  rowText: { flex: 1, gap: Spacing.half },
});
