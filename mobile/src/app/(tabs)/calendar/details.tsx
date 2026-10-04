import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { loadScheduled, type ScheduleStatus } from '@/features/calendar/repository';
import { SessionDetails } from '@/features/history/session-details';
import { formatTarget } from '@/features/plans/draft';
import { usePlanDetails } from '@/features/plans/use-plans';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { ActiveSessionExistsError, startSession } from '@/features/workout/repository';
import { formatDayWithWeekday } from '@/lib/date';

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  COMPLETED: 'wykonany',
  PLANNED: 'zaplanowany',
  MISSED: 'pominięty',
};

/**
 * Szczegóły terminu z kalendarza. Gdy trening się odbył, pokazujemy dokładnie ten sam ekran
 * co w historii — ten sam trening nie może wyglądać inaczej zależnie od drogi dojścia.
 * Ekran należy do stosu kalendarza, żeby cofanie wracało do kalendarza, a nie do innej zakładki.
 */
export default function ScheduledDetailsScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const entry = loadScheduled(db, id);

  if (!entry) return <ThemedView style={styles.flex} />;
  if (entry.sessionId !== null) {
    return (
      <SessionDetails
        id={entry.sessionId}
        updatePlanRoute={{ pathname: '/calendar/update-plan', params: { id: entry.sessionId } }}
      />
    );
  }
  return <PlannedDetails entry={entry} />;
}

/** Termin bez przeprowadzonego treningu: skład planu i start. */
function PlannedDetails({ entry }: { entry: NonNullable<ReturnType<typeof loadScheduled>> }) {
  const { items } = usePlanDetails(entry.planId);

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

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: entry.planTitle }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <ThemedText type="subtitle">{entry.planTitle}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDayWithWeekday(entry.scheduledDate)} · {entry.scheduledTime ?? 'cały dzień'} ·{' '}
            {STATUS_LABELS[entry.status]}
          </ThemedText>
        </View>

        <View style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            PLAN
          </ThemedText>
          {items.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                Ten plan nie ma jeszcze żadnego ćwiczenia.
              </ThemedText>
            </ThemedView>
          ) : (
            items.map((item) => (
              <ThemedView key={item.id} type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{item.exerciseName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatTarget(item)}
                </ThemedText>
              </ThemedView>
            ))
          )}
        </View>

        <Button label="Rozpocznij trening" icon="play_arrow" onPress={begin} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four },
  header: { gap: Spacing.half },
  group: { gap: Spacing.two },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
});
