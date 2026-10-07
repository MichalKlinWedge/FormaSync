import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import {
  attachSession,
  detachSession,
  loadScheduled,
  type ScheduleStatus,
  sessionsToAttach,
} from '@/features/calendar/repository';
import { PlanSegmentList } from '@/features/endurance/plan-segments';
import { GarminScheduleButton } from '@/features/garmin/connect/schedule-button';
import { useEndurancePlan } from '@/features/endurance/use-endurance-plan';
import { SessionDetails } from '@/features/history/session-details';
import { isEndurance } from '@/features/sports/sport';
import { formatTarget } from '@/features/plans/draft';
import { usePlanDetails } from '@/features/plans/use-plans';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { ActiveSessionExistsError, startSession } from '@/features/workout/repository';
import { formatDateTime, formatDayWithWeekday } from '@/lib/date';

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  COMPLETED: 'wykonany',
  PLANNED: 'zaplanowany',
  MISSED: 'pominięty',
};

type Entry = NonNullable<ReturnType<typeof loadScheduled>>;

/**
 * Szczegóły terminu z kalendarza. Gdy trening się odbył, pokazujemy dokładnie ten sam ekran
 * co w historii — ten sam trening nie może wyglądać inaczej zależnie od drogi dojścia.
 * Ekran należy do stosu kalendarza, żeby cofanie wracało do kalendarza, a nie do innej zakładki.
 */
export default function ScheduledDetailsScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  /**
   * Termin trzymamy w stanie, a nie czytamy przy każdym rysowaniu. Odczyt w ciele komponentu
   * kompilator Reacta zapamiętywał po `db` i `id` — a te się nie zmieniają, więc ekran pokazywał
   * dane sprzed zapisu aż do ponownego uruchomienia aplikacji.
   */
  const [entry, setEntry] = useState(() => loadScheduled(db, id));
  const reload = useCallback(() => setEntry(loadScheduled(db, id)), [id]);
  // Przesunięcie terminu dzieje się na osobnym ekranie, więc po powrocie czytamy go na nowo.
  useFocusEffect(reload);

  if (!entry) return <ThemedView style={styles.flex} />;

  if (entry.sessionId !== null) {
    const sessionId = entry.sessionId;
    const confirmDetach = () =>
      Alert.alert(
        'Odpiąć trening od terminu?',
        'Trening zostanie w historii, a termin wróci do niewykonanych.',
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Odepnij',
            style: 'destructive',
            onPress: () => {
              detachSession(db, sessionId);
              reload();
            },
          },
        ],
      );

    return (
      <SessionDetails
        id={sessionId}
        updatePlanRoute={{ pathname: '/calendar/update-plan', params: { id: sessionId } }}
        footer={
          <Button label="Odepnij od terminu" icon="link_off" variant="secondary" onPress={confirmDetach} />
        }
      />
    );
  }

  return <PlannedDetails entry={entry} onAttached={reload} />;
}

/** Termin bez przeprowadzonego treningu: skład planu, start i przypisanie treningu po fakcie. */
function PlannedDetails({ entry, onAttached }: { entry: Entry; onAttached: () => void }) {
  const { items } = usePlanDetails(entry.planId);
  // Bieg, rower i pływanie mają odcinki zamiast ćwiczeń — bez tego termin wyglądałby na pusty.
  const endurancePlan = useEndurancePlan(entry.planId);
  // Kandydatów czytamy dopiero przy rozwinięciu — większość terminów ich nie potrzebuje.
  const [candidates, setCandidates] = useState<{ id: number; title: string; startTime: string }[] | null>(
    null,
  );
  // Trening mógł dojść z zegarka, gdy ekran stał w tle; zwinięta lista każe przeczytać ją na nowo.
  useFocusEffect(useCallback(() => setCandidates(null), []));

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

  const attach = (sessionId: number) => {
    attachSession(db, entry.id, sessionId);
    onAttached();
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
          {isEndurance(entry.sport) ? (
            <PlanSegmentList rows={endurancePlan?.rows ?? []} sport={entry.sport} />
          ) : items.length === 0 ? (
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
        <Button
          label="Przesuń termin"
          icon="edit_calendar"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/calendar/schedule', params: { id: String(entry.id) } })
          }
        />
        <GarminScheduleButton
          scheduledId={entry.id}
          planId={entry.planId}
          scheduledDate={entry.scheduledDate}
          garminScheduleId={entry.garminScheduleId}
          onChanged={onAttached}
        />

        <View style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            TRENING JUŻ SIĘ ODBYŁ?
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Jeśli przeprowadziłeś ten trening poza kalendarzem, przypisz go do terminu — termin
            pokaże wtedy jego przebieg i zmieni się na wykonany.
          </ThemedText>
          {candidates === null ? (
            <Button
              label="Przypisz wykonany trening"
              icon="link"
              variant="secondary"
              onPress={() => setCandidates(sessionsToAttach(db, entry.scheduledDate, entry.sport))}
            />
          ) : candidates.length === 0 ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Brak treningów z okolic tej daty, które nie są jeszcze przypisane do innego terminu.
              </ThemedText>
              {/*
                Trening nagrany na zegarku nie jest jeszcze treningiem w aplikacji — czeka
                w „Z zegarka” na wczytanie. Bez tej wskazówki termin twierdzi, że nie ma czego
                przypisać, mimo że trening się odbył i widać go dwa ekrany dalej.
              */}
              <ThemedText type="small" themeColor="textSecondary">
                Trening nagrany na zegarku czeka na wczytanie i dopiero wtedy da się go tu
                przypisać — a stamtąd przypiszesz go od razu do tego terminu.
              </ThemedText>
              <Button
                label="Otwórz treningi z zegarka"
                icon="watch"
                variant="secondary"
                onPress={() => router.push('/history/import')}
              />
            </>
          ) : (
            <View style={styles.chips}>
              {candidates.map((session) => (
                <Chip
                  key={session.id}
                  label={`${session.title} · ${formatDateTime(session.startTime)}`}
                  selected={false}
                  onPress={() => attach(session.id)}
                />
              ))}
            </View>
          )}
        </View>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
