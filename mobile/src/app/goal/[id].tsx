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
import { GeminiError, NoApiKeyError, planWithGemini, PlanReplyError } from '@/features/goals/ai/gemini';
import { hasConsent, setConsent } from '@/features/goals/ai/tokens';
import { buildBrief, currentForm } from '@/features/goals/brief';
import { planGoal } from '@/features/goals/planner';
import {
  deleteGoal,
  GoalValidationError,
  materializeGoal,
  moveGoalDays,
  savePlan,
  setGoalStatus,
  type MovedTerm,
} from '@/features/goals/repository';
import { planDays } from '@/features/goals/reschedule';
import { KIND_LABELS, PHASE_LABELS } from '@/features/goals/shapes';
import { moveGarminSchedule } from '@/features/garmin/connect/move-schedule';
import { useGoal, weeksLeft } from '@/features/goals/use-goals';
import { SPORT_LABELS } from '@/features/sports/sport';
import { formatDate, todayKey, weekdayIndex, WEEKDAYS_LONG, WEEKDAYS_SHORT } from '@/lib/date';
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
  const [asking, setAsking] = useState(false);
  // Wybór dni trzymamy jako odstępstwa od stanu planu: po przesunięciu ekran wraca do tego,
  // co faktycznie stoi w kalendarzu, zamiast pokazywać poprzedni wybór.
  const [picked, setPicked] = useState<Record<number, number>>({});

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

  const standing = planDays(workouts, todayKey());
  const target = (day: number): number => picked[day] ?? day;
  const mapping = Object.fromEntries(standing.map((day) => [day, target(day)]));
  const moved = standing.some((day) => target(day) !== day);
  const clash = new Set(standing.map(target)).size !== standing.length;

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

  /**
   * Plan od modelu. Zgody pytamy raz i zapisujemy: to pierwsza rzecz w aplikacji, która wypuszcza
   * treningi poza telefon, więc musi o tym powiedzieć wprost, zanim cokolwiek wyśle.
   */
  const askGemini = () => {
    if (goal === null) return;
    if (!hasConsent()) {
      Alert.alert(
        'Wysłać dane do Google?',
        'Do Gemini pojadą: dystans i data zawodów, czas docelowy, dni treningowe, tygodniowa objętość, najlepsze tempo i lista treningów z ostatnich tygodni. Nie pojadą pomiary ciała, tętno, sen ani ciśnienie.',
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Wyślij',
            onPress: () => {
              setConsent(true);
              void runGemini();
            },
          },
        ],
      );
      return;
    }
    void runGemini();
  };

  const runGemini = async () => {
    if (goal === null) return;
    setAsking(true);
    try {
      const today = todayKey();
      const weeks = await planWithGemini(
        buildBrief(db, goal, new Date()),
        currentForm(db, goal.sport).history,
        today,
      );
      const added = savePlan(db, goalId, weeks, 'GEMINI');
      Alert.alert(
        'Plan od Gemini',
        `${pluralWith(weeks.length, 'tydzień', 'tygodnie', 'tygodni')}, ${pluralWith(added, 'jednostka', 'jednostki', 'jednostek')}. Przejrzyj go niżej — tempa i odcinki policzyła aplikacja, nie model.`,
      );
    } catch (e) {
      Alert.alert(
        e instanceof NoApiKeyError ? 'Brak klucza' : 'Nie udało się',
        describeAiError(e),
        e instanceof NoApiKeyError
          ? [
              { text: 'Później', style: 'cancel' },
              { text: 'Ustawienia', onPress: () => router.push('/goal/ai') },
            ]
          : undefined,
      );
    } finally {
      setAsking(false);
    }
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

  /**
   * Przestawienie gotowego planu na inne dni. Osobno od przeliczenia, bo to inna potrzeba:
   * pomyłka przy wyborze dni nie znaczy, że plan jest zły — znaczy, że stoi w złych kratkach.
   */
  const shiftDays = () => {
    const described = standing
      .filter((day) => target(day) !== day)
      .map((day) => `${WEEKDAYS_LONG[day]} → ${WEEKDAYS_LONG[target(day)]}`)
      .join('\n');
    Alert.alert(
      'Przesunąć plan?',
      `${described}\n\nPrzeszłość i dzień zawodów zostają na swoim miejscu.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Przesuń', onPress: applyDays },
      ],
    );
  };

  const applyDays = () => {
    let shift;
    try {
      shift = moveGoalDays(db, goalId, mapping);
    } catch (e) {
      Alert.alert(
        'Nie udało się',
        e instanceof GoalValidationError ? e.message : 'Nieznany błąd.',
      );
      return;
    }

    void syncWorkoutReminders();
    void moveGarminTerms(shift.terms);
    setPicked({});
    Alert.alert(
      shift.moved === 0 ? 'Nic się nie zmieniło' : 'Przesunięte',
      [
        shift.moved === 0
          ? 'Plan stoi już na tych dniach.'
          : `Przesunięte jednostki: ${shift.moved}.`,
        shift.terms.length === 0 ? null : `W tym terminów w kalendarzu: ${shift.terms.length}.`,
        shift.frozen === 0
          ? null
          : `Zostało na miejscu: ${shift.frozen} — w tych tygodniach zabrakło wolnego dnia.`,
        shift.anchored === 0 ? null : `Nietknięte: ${shift.anchored} (przeszłość i sam start).`,
      ]
        .filter(Boolean)
        .join('\n'),
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
            label={workouts.length === 0 ? 'Ułóż plan z reguł' : 'Przelicz plan z reguł'}
            icon="rule"
            onPress={plan}
          />
          <Button
            label={asking ? 'Pytam Gemini…' : 'Ułóż plan przez Gemini'}
            icon="auto_awesome"
            variant="secondary"
            onPress={askGemini}
            disabled={asking}
          />
          <Button
            label="Planista AI — klucz i model"
            icon="key"
            variant="secondary"
            onPress={() => router.push('/goal/ai')}
          />
          {goal.plannedBy !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {goal.plannedBy === 'GEMINI'
                ? 'Obecny plan ułożyło Gemini.'
                : 'Obecny plan ułożyły reguły w aplikacji.'}
            </ThemedText>
          )}
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
              DNI TRENINGOWE
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {standing.length === 0
                ? 'Przed Tobą nie ma już jednostek do przesunięcia.'
                : `Plan stoi teraz na: ${standing.map((day) => WEEKDAYS_LONG[day]).join(', ')}. Wskaż przy każdym dniu ten, na który ma przejść.`}
            </ThemedText>
            {standing.map((day) => (
              <View key={day} style={styles.section}>
                <ThemedText type="small">
                  {`${WEEKDAYS_LONG[day]} → ${WEEKDAYS_LONG[target(day)]}`}
                </ThemedText>
                <View style={styles.chips}>
                  {WEEKDAYS_SHORT.map((label, option) => (
                    <Chip
                      key={label}
                      label={label}
                      selected={target(day) === option}
                      onPress={() => setPicked({ ...picked, [day]: option })}
                    />
                  ))}
                </View>
              </View>
            ))}
            {clash && (
              <ThemedText type="small" themeColor="textSecondary">
                Dwa dni planu trafiłyby na ten sam dzień tygodnia — popraw wybór.
              </ThemedText>
            )}
            <Button
              label="Przesuń plan"
              icon="event_repeat"
              variant="secondary"
              onPress={shiftDays}
              disabled={!moved || clash}
            />
            <ThemedText type="small" themeColor="textSecondary">
              Przesunięcie zostawia plan taki, jaki jest — te same jednostki i objętości, tylko
              w innych kratkach tygodnia. Terminy już wpisane do kalendarza idą razem z nim.
              Przeszłość i dzień zawodów zostają nietknięte.
            </ThemedText>
          </View>
        )}

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
                    {`${WEEKDAYS_SHORT[weekdayIndex(workout.plannedDate)]} ${formatDate(workout.plannedDate).slice(0, 5)}`}
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

/**
 * Przeniesienie wpisów w kalendarzu Garmina za przesuniętymi terminami. Idzie w tle i po kolei:
 * każdy wpis to u Garmina zdjęcie i założenie od nowa, więc hurtem nie ma jak.
 */
async function moveGarminTerms(terms: MovedTerm[]): Promise<void> {
  const pending = terms.filter((term) => term.garminScheduleId !== null);
  if (pending.length === 0) return;

  let left = 0;
  for (const term of pending) {
    const outcome = await moveGarminSchedule({
      scheduledId: term.scheduledId,
      planId: term.planId,
      scheduleId: term.garminScheduleId as string,
      fromDate: term.from,
      toDate: term.to,
    });
    // Konto odłączone: dalsze próby i tak nic nie dadzą, a każda to osobne zapytanie.
    if (outcome.kind === 'NOT_CONNECTED') return;
    if (outcome.kind !== 'MOVED') left += 1;
  }

  if (left > 0) {
    Alert.alert(
      'Kalendarz Garmina niepełny',
      `W telefonie plan stoi na nowych dniach, ale u Garmina ${left} wpisów nie dało się przenieść. Popraw je w szczegółach terminu albo wyślij plan do Garmina jeszcze raz.`,
    );
  }
}

/** Błąd modelu po ludzku. Odczyt planu odróżniamy od awarii sieci, bo rada jest inna. */
function describeAiError(error: unknown): string {
  if (error instanceof PlanReplyError) {
    return `${error.message} Spróbuj jeszcze raz albo ułóż plan z reguł — wychodzi od razu i bez internetu.`;
  }
  if (error instanceof GeminiError) return error.message;
  return 'Nie udało się połączyć z Google. Sprawdź internet i spróbuj ponownie.';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  workout: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  date: { width: 62 },
  rowText: { flex: 1, gap: Spacing.half },
});
