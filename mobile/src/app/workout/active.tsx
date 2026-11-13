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
  restStartedAt,
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

const EXTEND_SECONDS = 15;

/**
 * Przezroczystość tła pasków fazy. Dopisana do koloru z motywu daje delikatne tło, które działa
 * i na białym, i na czarnym — bez drugiego zestawu kolorów w palecie.
 */
const TINT = '1F';

/**
 * Ręczna korekta bieżącej przerwy. Wiązana z przerwą przez chwilę jej rozpoczęcia, a nie przez
 * koniec: koniec przesuwa się przy każdym przedłużeniu, więc po nim przedłużonej przerwy nie dało
 * się rozpoznać i gasła w pierwotnym terminie.
 */
type RestOverride = { startedAt: number; delta: number | 'skip' };

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

  const restStart = session ? restStartedAt(session.exercises) : null;
  const override = restStart !== null && restOverride?.startedAt === restStart ? restOverride : null;
  const skipped = override?.delta === 'skip';
  const rest =
    session && !skipped
      ? restState(session.exercises, now, typeof override?.delta === 'number' ? override.delta : 0)
      : null;

  // Wibracja i dźwięk w chwili, gdy przerwa dobiega końca przy otwartym ekranie
  // (pominięcie nie wibruje i nie pika).
  const restActive = rest !== null;
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

  /** Przerwa albo praca; seria na czas jest pracą, więc bierze górę nad odliczaniem przerwy. */
  const resting = restActive && timed === null;

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
  /** Bieżąca seria ćwiczenia na czas — tę odpala duży „play” na belce. */
  const timedCurrent = current && current.exercise.trackingType === 'TIME' ? current : null;
  const timedCurrentSeconds = timedCurrent
    ? (timedCurrent.set.durationSeconds ?? timedCurrent.exercise.targetDurationSeconds)
    : null;

  /**
   * Kończy serię i puszcza przerwę. Jedna droga dla licznika i dla kropki przy serii: serię na
   * czas zamyka jedno i drugie, z czasem, który zdążył upłynąć — przy pełnym odliczeniu
   * zaplanowanym, przy odpuszczeniu w połowie takim, ile się wytrzymało.
   */
  const finishSet = (exercise: ActiveExercise | undefined, setId: number) => {
    const counting = timed?.setId === setId ? timed : null;
    completeSet(db, setId, counting ? { durationSeconds: Math.max(1, counting.elapsedSeconds) } : {});
    if (counting) {
      clearTimedSet(db);
      setTimedStore(null);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRestOverride(null);
    if (exercise) void scheduleCountdown(exercise.restDurationSeconds, exercise.name, 'rest');
    else void cancelCountdown();
    reload();
  };

  const toggleSet = (exercise: ActiveExercise, setId: number, done: boolean) => {
    if (!done) {
      finishSet(exercise, setId);
      return;
    }
    reopenSet(db, setId);
    void cancelCountdown();
    reload();
  };

  /**
   * Zdejmuje ćwiczenie z treningu. Zapisanych serii nie kasujemy bez pytania: to jedyna rzecz na
   * tym ekranie, której nie da się odtworzyć z pamięci — reszta stoi w planie.
   */
  const dropExercise = (exercise: ActiveExercise) => {
    const done = exercise.sets.filter((set) => set.completedAt !== null).length;
    const drop = () => {
      removeSessionExercise(db, exercise.id);
      reload();
    };
    if (done === 0) {
      drop();
      return;
    }
    Alert.alert(
      'Usunąć razem z zapisanymi seriami?',
      `${exercise.name} — zapisane serie: ${done}. Usunięcie zdejmie je z treningu.`,
      [
        { text: 'Zostaw', style: 'cancel' },
        { text: 'Usuń', style: 'destructive', onPress: drop },
      ],
    );
  };

  const extendRest = () => {
    if (!rest) return;
    const delta = (typeof override?.delta === 'number' ? override.delta : 0) + EXTEND_SECONDS;
    setRestOverride({ startedAt: rest.startedAt, delta });
    // Koniec przerwy już uwzględnia wcześniejsze przedłużenia, więc dokładamy tylko to jedno.
    void scheduleCountdown(
      (rest.endsAt + EXTEND_SECONDS * 1000 - now) / 1000,
      rest.exerciseName,
      'rest',
    );
  };

  const skipRest = () => {
    if (!rest) return;
    setRestOverride({ startedAt: rest.startedAt, delta: 'skip' });
    void cancelCountdown();
  };

  const startTimer = (exercise: ActiveExercise, set: ActiveSet) => {
    const seconds = set.durationSeconds ?? exercise.targetDurationSeconds;
    if (seconds === null || seconds <= 0) {
      Alert.alert('Nie wiadomo, ile ma trwać', 'Wpisz najpierw liczbę sekund w wierszu serii.');
      return;
    }
    // Powrót do pracy kończy przerwę — nie ma czego już odliczać.
    if (rest) setRestOverride({ startedAt: rest.startedAt, delta: 'skip' });
    startTimedSet(db, set.id, seconds);
    setTimedStore(loadTimedSet(db));
    void scheduleCountdown(seconds, exercise.name, 'set');
  };

  /** Zapisanie serii z licznika — to samo, co zaznaczenie kropki przy tej serii. */
  const saveTimer = () => {
    if (!timed) return;
    finishSet(
      session.exercises.find((e) => e.sets.some((set) => set.id === timed.setId)),
      timed.setId,
    );
  };

  /** Odliczanie odpalone przez pomyłkę: seria zostaje nietknięta. */
  const discardTimer = () => {
    clearTimedSet(db);
    setTimedStore(null);
    void cancelCountdown();
  };

  /**
   * Start serii na czas siedzi na belce, a nie w wierszu serii: w trakcie planku telefon leży
   * dalej niż na wyciągnięcie palca, a belka jest jedynym elementem widocznym z dystansu.
   */
  const startTimedButton = timedCurrent && (
    <Pressable
      accessibilityLabel={`Zacznij odliczanie: ${timedCurrent.exercise.name}, seria ${timedCurrent.set.setNumber}`}
      onPress={() => startTimer(timedCurrent.exercise, timedCurrent.set)}
      hitSlop={10}>
      <Icon name="play_circle" size={52} color={theme.success} />
    </Pressable>
  );

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
        {/*
          Z drugiego końca pokoju nie widać cyfr, więc fazę treningu niesie kolor: zielony pasek
          pod nagłówkiem znaczy „pracuj”, niebieski — „odpoczywaj”. Napisy w licznikach zostają,
          bo sam kolor nie wystarczy przy wadzie wzroku.
        */}
        <View style={[styles.phaseBar, { backgroundColor: resting ? theme.chart1 : theme.success }]} />
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
          <View style={[styles.rest, { backgroundColor: theme.success + TINT, borderLeftColor: theme.success }]}>
            <View style={styles.restText}>
              <ThemedText type="smallBold" style={{ color: theme.success }} numberOfLines={1}>
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
          </View>
        )}

        {rest && !timed && (
          <View style={[styles.rest, { backgroundColor: theme.chart1 + TINT, borderLeftColor: theme.chart1 }]}>
            <View style={styles.restText}>
              <ThemedText type="smallBold" style={{ color: theme.chart1 }} numberOfLines={1}>
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
            {startTimedButton}
          </View>
        )}

        {/*
          Nic nie odlicza, a kolejna seria jest na czas: belka stoi na zielono z samym „play”,
          żeby zacząć plank jednym naciśnięciem i bez szukania właściwego wiersza.
        */}
        {!timed && !rest && timedCurrent && (
          <View style={[styles.rest, { backgroundColor: theme.success + TINT, borderLeftColor: theme.success }]}>
            <View style={styles.restText}>
              <ThemedText type="smallBold" style={{ color: theme.success }} numberOfLines={1}>
                SERIA {timedCurrent.set.setNumber} · {timedCurrent.exercise.name}
              </ThemedText>
              <ThemedText type="subtitle">
                {timedCurrentSeconds ? formatClock(timedCurrentSeconds) : '—'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {timedCurrentSeconds ? 'naciśnij, aby odliczyć' : 'wpisz najpierw liczbę sekund'}
              </ThemedText>
            </View>
            {startTimedButton}
          </View>
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
                  onPress={() => dropExercise(exercise)}
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
  phaseBar: { height: 8 },
  rest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    borderRadius: 14,
    borderLeftWidth: 6,
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
