import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { ExerciseLink } from '@/features/exercises/exercise-link';
import { formatTarget } from '@/features/plans/draft';
import {
  type ActiveExercise,
  type ActiveSet,
  countSets,
  elapsedSeconds,
  findCurrentSet,
  formatClock,
  type RestState,
  restState,
  sessionTonnage,
} from '@/features/workout/logic';
import { cancelCountdown, scheduleCountdown } from '@/features/workout/notifications';
import { playCountdownEndSound, useCountdownSound } from '@/features/workout/countdown-sound';
import {
  clearTimedSet,
  loadTimedSet,
  startTimedSet,
  timedSetState,
} from '@/features/workout/timed-set';
import {
  abandonSession,
  activeSessionSport,
  addSet,
  completeSet,
  findActiveSessionId,
  removeSessionExercise,
  removeSet,
  reopenSet,
  type SetValues,
  updateSet,
} from '@/features/workout/repository';
import { ActiveEnduranceSession } from '@/features/endurance/active-session';
import { isEndurance } from '@/features/sports/sport';
import { SetRow } from '@/features/workout/set-row';
import { useSession } from '@/features/workout/use-session';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

const EXTEND_SECONDS = 30;

/** Ręczna korekta bieżącej przerwy. Wiązana z konkretną przerwą przez jej pierwotny koniec. */
type RestOverride = { baseEndsAt: number; delta: number | 'skip' };

function applyOverride(base: RestState | null, override: RestOverride | null, now: number): RestState | null {
  if (!base || !override) return base;
  if (override.delta === 'skip') return null;
  const endsAt = base.endsAt + override.delta * 1000;
  if (now >= endsAt) return null;
  return {
    ...base,
    endsAt,
    remainingSeconds: Math.ceil((endsAt - now) / 1000),
    totalSeconds: base.totalSeconds + override.delta,
  };
}

export default function ActiveWorkoutScreen() {
  useKeepAwake();
  const theme = useTheme();
  const now = useNow();
  const [sessionId] = useState(() => findActiveSessionId(db));
  const [sessionSport] = useState(() => (sessionId === null ? null : activeSessionSport(db, sessionId)));
  const { session, reload } = useSession(sessionId ?? -1);
  const [restOverride, setRestOverride] = useState<RestOverride | null>(null);
  // Odliczanie serii na czas przeżywa zamknięcie aplikacji, więc czytamy je z bazy, nie z pamięci.
  const [timedStore, setTimedStore] = useState(() => loadTimedSet(db));

  // Po powrocie z okna dodawania ćwiczeń sesja może mieć nowe pozycje.
  useFocusEffect(useCallback(() => reload(), [reload]));

  const baseRest = session ? restState(session.exercises, now) : null;
  const override = baseRest && restOverride?.baseEndsAt === baseRest.endsAt ? restOverride : null;
  const rest = applyOverride(baseRest, override, now);

  // Wibracja i dźwięk w chwili, gdy przerwa dobiega końca przy otwartym ekranie
  // (pominięcie nie wibruje i nie pika).
  const restActive = rest !== null;
  const skipped = override?.delta === 'skip';
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !restActive && !skipped) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playCountdownEndSound();
    }
    wasActive.current = restActive;
  }, [restActive, skipped]);

  /**
   * Odliczanie serii zostaje na ekranie także po dojściu do zera: czas wpisuje się sam, ale
   * zapisanie serii należy do ćwiczącego. Plank puszczony na 48. sekundzie to wynik 48 s,
   * nie 60 s, a licznik nie ma skąd wiedzieć, która wersja jest prawdziwa.
   */
  const timed = timedSetState(timedStore, now);
  const timedName =
    timed === null
      ? null
      : (session?.exercises.find((e) => e.sets.some((set) => set.id === timed.setId))?.name ?? null);

  /**
   * Jedno odliczanie naraz. Seria na czas ma pierwszeństwo: jeśli trwa, to znaczy, że przerwa
   * skończyła się powrotem do pracy — a dwa odliczania naraz nie dałyby się odróżnić po dźwięku.
   */
  useCountdownSound(timed ? timed.remainingSeconds : skipped ? null : (rest?.remainingSeconds ?? null));

  // Trening wytrzymałościowy prowadzi się po odcinkach, nie po seriach — to osobny ekran.
  if (sessionId !== null && sessionSport !== null && isEndurance(sessionSport)) {
    return <ActiveEnduranceSession sessionId={sessionId} />;
  }

  if (sessionId === null || !session) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Nie ma trwającego treningu.</ThemedText>
        <Button label="Wróć" variant="secondary" onPress={() => router.replace('/')} />
      </ThemedView>
    );
  }

  const elapsed = elapsedSeconds(session.startTime, now);
  const { completed, planned } = countSets(session.exercises);
  const tonnage = sessionTonnage(session.exercises);
  const current = findCurrentSet(session.exercises);

  const toggleSet = (exercise: ActiveExercise, setId: number, done: boolean) => {
    if (done) {
      reopenSet(db, setId);
      void cancelCountdown();
    } else {
      completeSet(db, setId);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setRestOverride(null);
      void scheduleCountdown(exercise.restDurationSeconds, exercise.name, 'rest');
    }
    reload();
  };

  const extendRest = () => {
    if (!baseRest || !rest) return;
    const delta = (typeof override?.delta === 'number' ? override.delta : 0) + EXTEND_SECONDS;
    setRestOverride({ baseEndsAt: baseRest.endsAt, delta });
    void scheduleCountdown((baseRest.endsAt + delta * 1000 - now) / 1000, rest.exerciseName, 'rest');
  };

  const skipRest = () => {
    if (!baseRest) return;
    setRestOverride({ baseEndsAt: baseRest.endsAt, delta: 'skip' });
    void cancelCountdown();
  };

  const startTimer = (exercise: ActiveExercise, set: ActiveSet) => {
    const seconds = set.durationSeconds ?? exercise.targetDurationSeconds;
    if (seconds === null || seconds <= 0) {
      Alert.alert('Nie wiadomo, ile ma trwać', 'Wpisz najpierw liczbę sekund w wierszu serii.');
      return;
    }
    // Powrót do pracy kończy przerwę — nie ma czego już odliczać.
    if (baseRest) setRestOverride({ baseEndsAt: baseRest.endsAt, delta: 'skip' });
    startTimedSet(db, set.id, seconds);
    setTimedStore(loadTimedSet(db));
    void scheduleCountdown(seconds, exercise.name, 'set');
  };

  /**
   * Zapisuje serię z czasem, który rzeczywiście upłynął — przy pełnym odliczeniu to czas
   * zaplanowany, przy odpuszczeniu w połowie tyle, ile się wytrzymało. Dalej leci przerwa,
   * tak samo jak po zwykłej serii.
   */
  const saveTimer = () => {
    if (!timed) return;
    const exercise = session.exercises.find((e) => e.sets.some((set) => set.id === timed.setId));
    completeSet(db, timed.setId, { durationSeconds: Math.max(1, timed.elapsedSeconds) });
    clearTimedSet(db);
    setTimedStore(null);
    setRestOverride(null);
    if (exercise) void scheduleCountdown(exercise.restDurationSeconds, exercise.name, 'rest');
    else void cancelCountdown();
    reload();
  };

  /** Odliczanie odpalone przez pomyłkę: seria zostaje nietknięta. */
  const discardTimer = () => {
    clearTimedSet(db);
    setTimedStore(null);
    void cancelCountdown();
  };

  const confirmAbandon = () =>
    Alert.alert('Przerwać trening?', 'Wykonane serie zostaną zapisane, niewykonane przepadną.', [
      { text: 'Kontynuuj trening', style: 'cancel' },
      {
        text: 'Przerwij',
        style: 'destructive',
        onPress: () => {
          abandonSession(db, session.id);
          clearTimedSet(db);
          void cancelCountdown();
          router.replace('/');
        },
      },
    ]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {session.title}
            </ThemedText>
            <ThemedText type="title" style={styles.clock}>
              {formatClock(elapsed)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {completed}/{planned} serii · tonaż {Math.round(tonnage)} kg
            </ThemedText>
          </View>
          <Pressable accessibilityLabel="Przerwij trening" onPress={confirmAbandon} hitSlop={8}>
            <Icon name="close" size={26} color={theme.textSecondary} />
          </Pressable>
        </View>

        {timed && (
          <ThemedView type="backgroundSelected" style={styles.rest}>
            <View style={styles.restText}>
              <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
                SERIA · {timedName ?? 'na czas'}
              </ThemedText>
              {/*
                Licznik serii jest tym, na co patrzy się w trakcie planku — stąd cyfry większe
                niż w przerwie. Po zerze nie schodzi poniżej, bo ujemny czas trzymania nie istnieje.
              */}
              <ThemedText type="title" style={styles.setClock}>
                {formatClock(Math.max(0, timed.remainingSeconds))}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                z {formatClock(timed.totalSeconds)}
                {timed.remainingSeconds <= 0 ? ' · koniec' : ''}
              </ThemedText>
            </View>
            <Pressable onPress={saveTimer} hitSlop={6}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Zapisz
              </ThemedText>
            </Pressable>
            <Pressable onPress={discardTimer} hitSlop={6}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Odrzuć
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}

        {rest && !timed && (
          <ThemedView type="backgroundSelected" style={styles.rest}>
            <View style={styles.restText}>
              <ThemedText type="smallBold" themeColor="textSecondary" numberOfLines={1}>
                PRZERWA · {rest.exerciseName}
              </ThemedText>
              <ThemedText type="subtitle">{formatClock(rest.remainingSeconds)}</ThemedText>
            </View>
            <Pressable onPress={extendRest} hitSlop={6}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                +{EXTEND_SECONDS} s
              </ThemedText>
            </Pressable>
            <Pressable onPress={skipRest} hitSlop={6}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Pomiń
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {session.exercises.map((exercise) => (
            <ThemedView key={exercise.id} type="backgroundElement" style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitle}>
                  <ExerciseLink
                    exerciseId={exercise.exerciseId}
                    name={exercise.name}
                    withName
                    textType="smallBold"
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    cel: {formatTarget(exercise)} · przerwa {formatClock(exercise.restDurationSeconds)}
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityLabel={`Usuń ${exercise.name} z treningu`}
                  onPress={() => {
                    removeSessionExercise(db, exercise.id);
                    reload();
                  }}
                  hitSlop={6}>
                  <Icon name="delete" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>

              {exercise.sets.map((set) => (
                <SetRow
                  key={set.id}
                  exercise={exercise}
                  set={set}
                  isCurrent={current?.set.id === set.id}
                  isTiming={timed?.setId === set.id}
                  onEdit={(values: SetValues) => updateSet(db, set.id, values)}
                  onEditEnd={reload}
                  onToggle={() => toggleSet(exercise, set.id, set.completedAt !== null)}
                  onRemove={() => {
                    removeSet(db, set.id);
                    reload();
                  }}
                  onStartTimer={() => startTimer(exercise, set)}
                />
              ))}

              <Pressable
                onPress={() => {
                  addSet(db, exercise.id);
                  reload();
                }}
                style={styles.addSet}
                hitSlop={4}>
                <Icon name="add" size={18} color={theme.accent} />
                <ThemedText type="small" style={{ color: theme.accent }}>
                  Dodaj serię
                </ThemedText>
              </Pressable>
            </ThemedView>
          ))}

          <Button
            label="Dodaj ćwiczenie"
            icon="add"
            variant="secondary"
            onPress={() => router.push('/workout/pick-exercise')}
          />
          <Button label="Zakończ trening" icon="check" onPress={() => router.push('/workout/finish')} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  headerText: { flex: 1 },
  clock: { fontSize: 40, lineHeight: 46 },
  rest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  restText: { flex: 1 },
  setClock: { fontSize: 34, lineHeight: 40 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, marginBottom: Spacing.one },
  cardTitle: { flex: 1 },
  addSet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
});
