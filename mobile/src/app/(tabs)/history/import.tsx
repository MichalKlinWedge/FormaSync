import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

import type { ImportCandidate, InventoryEntry, WatchActivities } from '@/features/health/activities';
import {
  archiveWatchActivity,
  importWatchActivity,
  importWatchActivityToTerm,
  linkWatchActivity,
  listArchived,
  listWatchActivities,
  restoreWatchActivity,
  sessionsToLink,
  termsForActivity,
} from '@/features/health/activities';
import {
  ExercisePermissionError,
  HealthPermissionsError,
  HealthUnavailableError,
  HISTORY_DAYS,
  requestDistancePermission,
  requestExercisePermission,
} from '@/features/health/sync';
import { describeRefresh, STATUS_LABELS } from '@/features/health/activities-mapping';
import { formatDistance } from '@/features/endurance/format';
import { SPORT_LABELS } from '@/features/sports/sport';
import { formatClock } from '@/features/workout/logic';
import { formatDateTime } from '@/lib/date';
import { formatNumber } from '@/lib/number';

/**
 * Treningi nagrane poza aplikacją. Garmin Connect zapisuje je do Health Connect, skąd przychodzi
 * czas i biometria — bez serii i powtórzeń, których Health Connect nie udostępnia. Każdą aktywność
 * można dopisać do historii osobno, połączyć z treningiem prowadzonym w aplikacji albo odłożyć.
 */
export default function ImportActivitiesScreen() {
  const [activities, setActivities] = useState<ImportCandidate[] | null>(null);
  const [distanceAvailable, setDistanceAvailable] = useState(true);
  const [archived, setArchived] = useState(() => listArchived());
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [seen, setSeen] = useState<InventoryEntry[]>([]);
  const [showSeen, setShowSeen] = useState(false);

  const apply = (result: WatchActivities) => {
    setActivities(result.activities);
    setDistanceAvailable(result.distanceAvailable);
    setSeen(result.inventory);
    setProblem(null);
  };

  useEffect(() => {
    let cancelled = false;
    listWatchActivities()
      .then((result) => {
        if (cancelled) return;
        apply(result);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setActivities([]);
        setProblem(describeProblem(e));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setActivities(null);
    setAttempt((value) => value + 1);
  };

  /**
   * Ręczne sprawdzenie, co nowego leży w Health Connect. Listy nie czyścimy na czas odczytu —
   * to, co już na niej jest, nie znika, a zajęty przycisk wystarczy za informację o pracy w tle.
   */
  const checkForNew = async () => {
    setChecking(true);
    const before = new Set(activities?.map((activity) => activity.recordId));
    try {
      const result = await listWatchActivities();
      apply(result);
      const fresh = result.activities.filter((activity) => !before.has(activity.recordId)).length;
      Alert.alert('Sprawdzono', describeRefresh(fresh, result.activities.length));
    } catch (e) {
      setActivities([]);
      setProblem(describeProblem(e));
    } finally {
      setChecking(false);
    }
  };

  // Okno zgody pokazuje Health Connect — decyzję podejmuje użytkownik, my tylko ponawiamy odczyt.
  const grantAndRetry = async () => {
    await requestExercisePermission();
    retry();
  };

  const grantDistanceAndRetry = async () => {
    await requestDistancePermission();
    retry();
  };

  const drop = (recordId: string) =>
    setActivities((current) => current?.filter((item) => item.recordId !== recordId) ?? null);

  const run = (what: string, action: () => void) => {
    setBusy(true);
    try {
      action();
    } catch (e) {
      Alert.alert(what, e instanceof Error ? e.message : 'Nieznany błąd.');
    } finally {
      setBusy(false);
    }
  };

  const add = (activity: ImportCandidate) =>
    run('Nie udało się dodać', () => {
      const sessionId = importWatchActivity(activity);
      drop(activity.recordId);
      router.replace({ pathname: '/history/[id]', params: { id: sessionId } });
    });

  const addToTerm = (activity: ImportCandidate, scheduledId: number) =>
    run('Nie udało się przypisać', () => {
      const sessionId = importWatchActivityToTerm(scheduledId, activity);
      drop(activity.recordId);
      router.replace({ pathname: '/history/[id]', params: { id: sessionId } });
    });

  const link = (activity: ImportCandidate, sessionId: number) =>
    run('Nie udało się połączyć', () => {
      linkWatchActivity(sessionId, activity);
      drop(activity.recordId);
      router.replace({ pathname: '/history/[id]', params: { id: sessionId } });
    });

  const archive = (activity: ImportCandidate) =>
    run('Nie udało się odłożyć', () => {
      archiveWatchActivity(activity);
      drop(activity.recordId);
      setArchived(listArchived());
    });

  const restore = (recordId: string) =>
    run('Nie udało się przywrócić', () => {
      restoreWatchActivity(recordId);
      setArchived(listArchived());
      retry();
    });

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Treningi z ostatnich {HISTORY_DAYS} dni nagrane poza aplikacją. Przychodzi czas trwania,
          dystans, tętno i kalorie — serii i powtórzeń Health Connect nie udostępnia, więc liczy je
          tylko trening prowadzony w FormaSync.
        </ThemedText>

        {problem === null && (
          <Button
            label={checking ? 'Sprawdzam…' : 'Sprawdź nowe treningi'}
            icon="sync"
            variant="secondary"
            onPress={() => void checkForNew()}
            disabled={checking || busy || activities === null}
          />
        )}

        {!distanceAvailable && problem === null && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small">
              Health Connect nie pozwala jeszcze odczytywać dystansu. To osobna zgoda — bez niej biegi
              przychodzą bez kilometrów i bez tempa.
            </ThemedText>
            <Button label="Przyznaj zgodę na dystans" icon="check" onPress={() => void grantDistanceAndRetry()} />
          </ThemedView>
        )}

        {activities === null && (
          <View style={styles.busy}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Czytam z Health Connect…
            </ThemedText>
          </View>
        )}

        {problem !== null && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small">{problem.message}</ThemedText>
            {problem.needsPermission ? (
              <Button label="Przyznaj zgodę" icon="check" onPress={() => void grantAndRetry()} />
            ) : (
              <Button label="Spróbuj ponownie" icon="sync" variant="secondary" onPress={retry} />
            )}
          </ThemedView>
        )}

        {activities !== null && problem === null && activities.length === 0 && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              Nie ma nic nowego do wczytania. Treningi już dopisane do historii i te odłożone pomijamy.
            </ThemedText>
          </ThemedView>
        )}

        {activities?.map((activity) => (
          <ActivityCard
            key={activity.recordId}
            activity={activity}
            busy={busy}
            onAdd={() => add(activity)}
            onAddToTerm={(scheduledId) => addToTerm(activity, scheduledId)}
            onLink={(sessionId) => link(activity, sessionId)}
            onArchive={() => archive(activity)}
          />
        ))}

        {archived.length > 0 && (
          <View style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ODŁOŻONE
            </ThemedText>
            {archived.map((item) => (
              <ThemedView key={item.recordId} type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{item.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatDateTime(item.startTime)}
                </ThemedText>
                <Button
                  label="Przywróć"
                  icon="undo"
                  variant="secondary"
                  onPress={() => restore(item.recordId)}
                  disabled={busy}
                />
              </ThemedView>
            ))}
          </View>
        )}

        {problem === null && seen.length > 0 && (
          <View style={styles.group}>
            <Button
              label={showSeen ? 'Ukryj spis z Health Connect' : `Co odczytano z Health Connect (${seen.length})`}
              icon="list"
              variant="secondary"
              onPress={() => setShowSeen((value) => !value)}
            />
            {showSeen && (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  Wszystko, co Health Connect zwrócił za ostatnie {HISTORY_DAYS} dni — razem z tym, co
                  lista wyżej pomija. Czego nie ma w tym spisie, tego Garmin Connect nie zapisał do
                  Health Connect i aplikacja nie ma tego skąd wziąć.
                </ThemedText>
                {seen.map((item) => (
                  <View key={item.recordId} style={styles.row}>
                    <ThemedText type="small" style={styles.rowText}>
                      {formatDateTime(item.startTime)} · {item.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {STATUS_LABELS[item.status]}
                    </ThemedText>
                  </View>
                ))}
              </ThemedView>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

type ActivityCardProps = {
  activity: ImportCandidate;
  busy: boolean;
  onAdd: () => void;
  onAddToTerm: (scheduledId: number) => void;
  onLink: (sessionId: number) => void;
  onArchive: () => void;
};

function ActivityCard({ activity, busy, onAdd, onAddToTerm, onLink, onArchive }: ActivityCardProps) {
  // Terminy czytamy od razu: jest ich najwyżej kilka w dniu, a od nich zależy, co karta proponuje.
  const terms = useMemo(() => termsForActivity(activity), [activity]);
  // Listę treningów do połączenia czytamy dopiero przy rozwinięciu — nie potrzebuje jej
  // większość kart, a zapytanie trafia do bazy za każdym razem od nowa.
  const [candidates, setCandidates] = useState<{ id: number; title: string; startTime: string }[] | null>(
    null,
  );
  const match = activity.matchingSession;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{activity.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {[
          SPORT_LABELS[activity.sport],
          formatDateTime(activity.startTime),
          formatClock(activity.durationSeconds),
          activity.distanceMeters === null ? null : formatDistance(activity.distanceMeters),
        ]
          .filter(Boolean)
          .join(' · ')}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {describeMetrics(activity)}
      </ThemedText>

      {match !== null && (
        <ThemedText type="small" themeColor="textSecondary">
          W tym samym czasie trwał trening „{match.title}”. Połącz je, a pomiary z czujników trafią
          do niego zamiast tworzyć drugi wpis.
        </ThemedText>
      )}

      {match !== null ? (
        <Button label={`Połącz z „${match.title}”`} icon="link" onPress={() => onLink(match.id)} disabled={busy} />
      ) : null}

      {terms.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {terms.length === 1
            ? 'Na ten dzień czeka zaplanowany termin tej dyscypliny.'
            : 'Na ten dzień czekają zaplanowane terminy tej dyscypliny.'}
        </ThemedText>
      )}
      {terms.map((term) => (
        <Button
          key={term.id}
          label={`Przypisz do „${term.title}”${term.scheduledTime === null ? '' : ` · ${term.scheduledTime}`}`}
          icon="event_available"
          onPress={() => onAddToTerm(term.id)}
          disabled={busy}
        />
      ))}

      <Button
        label="Dodaj jako osobny trening"
        icon="add"
        variant="secondary"
        onPress={onAdd}
        disabled={busy}
      />

      {candidates === null ? (
        <Button
          label="Połącz z innym treningiem"
          icon="link"
          variant="secondary"
          onPress={() => setCandidates(sessionsToLink(activity))}
          disabled={busy}
        />
      ) : candidates.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Brak treningów z okolic tej daty, które nie mają jeszcze pomiarów z zegarka.
        </ThemedText>
      ) : (
        <View style={styles.chips}>
          {candidates.map((session) => (
            <Chip
              key={session.id}
              label={`${session.title} · ${formatDateTime(session.startTime)}`}
              selected={false}
              onPress={() => onLink(session.id)}
            />
          ))}
        </View>
      )}

      <Button label="Odłóż" icon="archive" variant="secondary" onPress={onArchive} disabled={busy} />
    </ThemedView>
  );
}

type Problem = { message: string; needsPermission: boolean };

function describeProblem(error: unknown): Problem {
  if (error instanceof ExercisePermissionError) {
    return {
      message:
        'Health Connect nie pozwala jeszcze odczytywać ćwiczeń. To osobna zgoda — nadasz ją tutaj.',
      needsPermission: true,
    };
  }
  if (error instanceof HealthPermissionsError) {
    return { message: 'Najpierw połącz aplikację z Health Connect w Ustawieniach.', needsPermission: false };
  }
  if (error instanceof HealthUnavailableError) return { message: error.message, needsPermission: false };
  return {
    message: error instanceof Error ? error.message : 'Nie udało się odczytać danych.',
    needsPermission: false,
  };
}

function describeMetrics(activity: ImportCandidate): string {
  const parts = [
    activity.avgHeartRate !== null ? `tętno śr. ${activity.avgHeartRate}` : null,
    activity.maxHeartRate !== null ? `maks. ${activity.maxHeartRate}` : null,
    activity.caloriesBurned !== null ? `${formatNumber(activity.caloriesBurned)} kcal` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Bez danych biometrycznych';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  group: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowText: { flex: 1 },
});
