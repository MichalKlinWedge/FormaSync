import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

import type { Sport } from '@/db/schema';
import type {
  HistoryProgress,
  ImportCandidate,
  InventoryEntry,
  WatchActivities,
} from '@/features/activities/import';
import {
  archiveWatchActivity,
  backfillLaps,
  GarminNotConnectedError,
  HISTORY_PERIODS,
  importHistory,
  LONGEST_HISTORY_DAYS,
  repairSports,
  importWatchActivity,
  importWatchActivityToTerm,
  linkWatchActivity,
  listArchived,
  listWatchActivities,
  restoreWatchActivity,
  sessionsToLink,
  termsForActivity,
} from '@/features/activities/import';
import {
  describeHistoryImport,
  describeLapBackfill,
  describeSportRepair,
  describeRefresh,
  IMPORT_DAYS,
  STATUS_LABELS,
} from '@/features/activities/mapping';
import { GarminAuthExpired, GarminError } from '@/features/garmin/connect/client';
import { formatDistance } from '@/features/endurance/format';
import { GOAL_SPORTS } from '@/features/goals/planner';
import { SPORT_LABELS } from '@/features/sports/sport';
import { formatClock } from '@/features/workout/logic';
import { formatDateTime } from '@/lib/date';
import { formatNumber } from '@/lib/number';

/**
 * Treningi nagrane poza aplikacją. Czytamy je wprost z Garmin Connect — tym samym połączeniem,
 * którym wysyłamy tam plany. Przychodzi czas, dystans i biometria, bez serii i powtórzeń, bo tych
 * zegarek nie udostępnia. Każdą aktywność można dopisać do historii osobno, połączyć z treningiem
 * prowadzonym w aplikacji albo odłożyć.
 */
export default function ImportActivitiesScreen() {
  const [activities, setActivities] = useState<ImportCandidate[] | null>(null);
  const [archived, setArchived] = useState(() => listArchived());
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [seen, setSeen] = useState<InventoryEntry[]>([]);
  const [showSeen, setShowSeen] = useState(false);
  const [laps, setLaps] = useState(false);
  const [history, setHistory] = useState<number | null>(null);
  const [progress, setProgress] = useState<HistoryProgress | null>(null);
  // Przy pięciu latach wszystkiego dochodzi każdy spacer i każda joga; po rekordy biegowe
  // sięga się po same biegi, więc zawężenie musi być pod ręką.
  const [onlySport, setOnlySport] = useState<Sport | null>(null);
  const [sports, setSports] = useState(false);

  const apply = (result: WatchActivities) => {
    setActivities(result.activities);
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
   * Ręczne pobranie z Garmin Connect. Listy nie czyścimy na czas odczytu — to, co już na niej jest,
   * nie znika, a zajęty przycisk wystarczy za informację o pracy w tle.
   */
  const checkForNew = async () => {
    setChecking(true);
    const before = new Set(activities?.map((activity) => activity.recordId));
    try {
      const result = await listWatchActivities();
      apply(result);
      const fresh = result.activities.filter((activity) => !before.has(activity.recordId)).length;
      Alert.alert('Pobrano', describeRefresh(fresh, result.activities.length));
    } catch (e) {
      setActivities([]);
      setProblem(describeProblem(e));
    } finally {
      setChecking(false);
    }
  };

  const drop = (recordId: string) =>
    setActivities((current) => current?.filter((item) => item.recordId !== recordId) ?? null);

  /** Wspólna obsługa akcji na karcie. Okrążenia dochodzą z sieci, więc każda czeka na odpowiedź. */
  const run = async (what: string, action: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      Alert.alert(what, e instanceof Error ? e.message : 'Nieznany błąd.');
    } finally {
      setBusy(false);
    }
  };

  const add = (activity: ImportCandidate) =>
    run('Nie udało się dodać', async () => {
      const sessionId = await importWatchActivity(activity);
      drop(activity.recordId);
      router.replace({ pathname: '/history/[id]', params: { id: sessionId } });
    });

  const addToTerm = (activity: ImportCandidate, scheduledId: number) =>
    run('Nie udało się przypisać', async () => {
      const sessionId = await importWatchActivityToTerm(scheduledId, activity);
      drop(activity.recordId);
      router.replace({ pathname: '/history/[id]', params: { id: sessionId } });
    });

  const link = (activity: ImportCandidate, sessionId: number) =>
    run('Nie udało się połączyć', async () => {
      await linkWatchActivity(sessionId, activity);
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

  const pullHistory = (days: number) =>
    run('Nie udało się ściągnąć historii', async () => {
      setHistory(days);
      setProgress(null);
      try {
        const result = await importHistory(days, { sport: onlySport, onProgress: setProgress });
        Alert.alert('Historia', describeHistoryImport(result));
      } finally {
        setHistory(null);
        setProgress(null);
      }
    });

  const fixSports = () =>
    run('Nie udało się przeliczyć dyscyplin', async () => {
      setSports(true);
      try {
        Alert.alert('Dyscypliny', describeSportRepair(await repairSports(LONGEST_HISTORY_DAYS)));
      } finally {
        setSports(false);
      }
    });

  const fetchLaps = () =>
    run('Nie udało się dociągnąć okrążeń', async () => {
      setLaps(true);
      try {
        Alert.alert('Okrążenia', describeLapBackfill(await backfillLaps()));
      } finally {
        setLaps(false);
      }
    });

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Treningi z ostatnich {IMPORT_DAYS} dni nagrane poza aplikacją, czytane wprost z Garmin
          Connect. Przychodzi czas trwania, dystans, tętno i kalorie — serii i powtórzeń zegarek nie
          udostępnia, więc liczy je tylko trening prowadzony w FormaSync.
        </ThemedText>

        {problem === null && (
          <Button
            label={checking ? 'Pobieram…' : 'Pobierz z Garmin Connect'}
            icon="sync"
            variant="secondary"
            onPress={() => void checkForNew()}
            disabled={checking || busy || activities === null}
          />
        )}

        {problem === null && (
          <View style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ŚCIĄGNIJ CAŁĄ HISTORIĘ
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Dopisuje do historii wszystkie treningi z wybranego okresu naraz — bez pytania
              o każdy osobno. Przydaje się na start: plan pod zawody liczy formę właśnie z tego,
              co w historii leży, a rekordy życiowe rzadko padają w ostatnim sezonie. Pomijamy
              treningi już wczytane, odłożone i te prowadzone w aplikacji.
            </ThemedText>
            <View style={styles.chips}>
              <Chip
                label="Wszystko"
                selected={onlySport === null}
                onPress={() => setOnlySport(null)}
              />
              {GOAL_SPORTS.map((sport) => (
                <Chip
                  key={sport}
                  label={SPORT_LABELS[sport]}
                  selected={onlySport === sport}
                  onPress={() => setOnlySport(sport)}
                />
              ))}
            </View>
            <View style={styles.chips}>
              {HISTORY_PERIODS.map((period) => (
                <Button
                  key={period.days}
                  label={history === period.days ? describeProgress(progress) : period.label}
                  icon="history"
                  variant="secondary"
                  onPress={() => void pullHistory(period.days)}
                  disabled={history !== null || sports || laps || busy || activities === null}
                />
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Okrążenia tą drogą nie dochodzą — to osobne zapytanie na każdy trening. Dociągnij je
              przyciskiem poniżej, już po wczytaniu historii.
            </ThemedText>
          </View>
        )}

        {problem === null && (
          <View style={styles.group}>
            <Button
              label={sports ? 'Przeliczam…' : 'Przelicz dyscypliny wczytanych treningów'}
              icon="category"
              variant="secondary"
              onPress={() => void fixSports()}
              disabled={sports || laps || checking || busy || history !== null || activities === null}
            />
            <ThemedText type="small" themeColor="textSecondary">
              Marsze i wędrówki trafiały wcześniej do biegania, przez co wycieczka w góry stawała
              się rekordem biegowym i zawyżała objętość, z której plan pod zawody liczy formę.
              Przycisk pyta Garmina o rodzaj każdej wczytanej aktywności i przypisuje dyscyplinę
              od nowa. Treningów prowadzonych w aplikacji nie rusza.
            </ThemedText>
          </View>
        )}

        {problem === null && (
          <View style={styles.group}>
            <Button
              label={laps ? 'Dociągam okrążenia…' : 'Dociągnij okrążenia do historii'}
              icon="timeline"
              variant="secondary"
              onPress={() => void fetchLaps()}
              disabled={laps || checking || busy || history !== null || activities === null}
            />
            <ThemedText type="small" themeColor="textSecondary">
              Treningi wczytane wcześniej mają w bazie tylko sumy. Okrążenia pozwalają wyliczyć
              rekord z najszybszego fragmentu, a nie ze średniej całego treningu.
            </ThemedText>
          </View>
        )}

        {activities === null && (
          <View style={styles.busy}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              Czytam z Garmin Connect…
            </ThemedText>
          </View>
        )}

        {problem !== null && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small">{problem.message}</ThemedText>
            {problem.retryable && (
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
              label={showSeen ? 'Ukryj spis' : `Co odczytano z Garmin Connect (${seen.length})`}
              icon="list"
              variant="secondary"
              onPress={() => setShowSeen((value) => !value)}
            />
            {showSeen && (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  Wszystko, co Garmin Connect zwrócił za ostatnie {IMPORT_DAYS} dni — razem z tym, co
                  lista wyżej pomija. Czego nie ma w tym spisie, tego nie ma też w Garmin Connect —
                  wtedy zsynchronizuj zegarek z telefonem.
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

/** Co robimy w tej chwili — odczyt z Garmina i zapis do bazy trwają osobno. */
function describeProgress(progress: HistoryProgress | null): string {
  if (progress === null) return 'Ściągam…';
  return progress.phase === 'FETCH' ? `Ściągam… ${progress.count}` : `Zapisuję… ${progress.count}`;
}

type Problem = { message: string; retryable: boolean };

function describeProblem(error: unknown): Problem {
  if (error instanceof GarminNotConnectedError) {
    return {
      message: 'Najpierw połącz aplikację z Garmin Connect w Ustawieniach — stąd bierzemy treningi.',
      retryable: false,
    };
  }
  if (error instanceof GarminAuthExpired) {
    return {
      message: 'Połączenie z Garmin Connect wygasło. Zaloguj się ponownie w Ustawieniach.',
      retryable: false,
    };
  }
  if (error instanceof GarminError) return { message: error.message, retryable: true };
  return {
    message: 'Nie udało się połączyć z Garminem. Sprawdź internet i spróbuj ponownie.',
    retryable: true,
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
