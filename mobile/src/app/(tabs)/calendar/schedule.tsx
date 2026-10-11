import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { CompactNumberInput } from '@/components/compact-number-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { sports } from '@/db/schema';
import { syncWorkoutReminders } from '@/features/calendar/reminders';
import {
  loadScheduled,
  ScheduleConflictError,
  scheduleWorkouts,
  updateScheduled,
} from '@/features/calendar/repository';
import { toggleValue } from '@/features/exercises/filter';
import { moveGarminSchedule, type MoveOutcome } from '@/features/garmin/connect/move-schedule';
import { searchPlans } from '@/features/plans/search';
import { usePlanList } from '@/features/plans/use-plans';
import { SPORT_LABELS } from '@/features/sports/sport';
import { useActiveSport } from '@/features/sports/sport-store';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatDate, formatDayWithWeekday, generateRecurringDates, todayKey, WEEKDAYS_SHORT } from '@/lib/date';

const REMINDER_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: 'bez przypomnienia', minutes: null },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 godz.', minutes: 60 },
  { label: '2 godz.', minutes: 120 },
  { label: 'dzień wcześniej', minutes: 24 * 60 },
];

const WEEK_OPTIONS = [1, 2, 4, 8, 12];

export default function ScheduleScreen() {
  const params = useLocalSearchParams<{ date?: string; id?: string }>();
  // Z identyfikatorem ekran edytuje istniejący termin: te same pola, bez wyboru planu
  // i bez cyklu — przesuwa się jeden wpis, a nie zakłada nowe.
  const editedId = params.id === undefined ? null : Number(params.id);
  const [edited] = useState(() => (editedId === null ? null : loadScheduled(db, editedId)));
  const theme = useTheme();
  const activeSport = useActiveSport();
  const { own, templates } = usePlanList();
  const plans = [...own, ...templates];
  // Lista planów rośnie z każdym celem, więc wybór zaczyna się od zawężenia po nazwie.
  const [search, setSearch] = useState('');
  const matching = searchPlans(plans, search);
  // Kalendarz jest wspólny dla dyscyplin, więc planów nie zawężamy — ale dzielimy je na grupy
  // i aktywną dyscyplinę dajemy na górę. Bez tego lista to ściana nazw, z której nie widać,
  // że bieg czy pływanie w ogóle da się zaplanować.
  const groups = [...sports]
    .sort((a, b) => Number(b === activeSport) - Number(a === activeSport))
    .map((sport) => ({ sport, items: matching.filter((plan) => plan.sport === sport) }))
    .filter((group) => group.items.length > 0);

  const [startDate, setStartDate] = useState(edited?.scheduledDate ?? params.date ?? todayKey());
  // Plany dochodzą z zapytania na żywo, więc przy pierwszym rysowaniu lista jest pusta.
  // Wybór trzymamy jako „nic nie kliknięto” i dopiero wyliczamy z niego pierwszy plan.
  const [pickedPlanId, setPickedPlanId] = useState<number | null>(null);
  // Wybrany plan musi być widoczny: po zawężeniu listy zostaje pierwszy z tych, które pasują,
  // bo inaczej zapisalibyśmy termin z planem, którego na ekranie już nie ma.
  const planId =
    pickedPlanId !== null && matching.some((plan) => plan.id === pickedPlanId)
      ? pickedPlanId
      : (groups[0]?.items[0]?.id ?? null);
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
  const [allDay, setAllDay] = useState(edited !== null && edited.scheduledTime === null);
  const [hour, setHour] = useState<number | null>(timePart(edited?.scheduledTime, 0) ?? 18);
  const [minute, setMinute] = useState<number | null>(timePart(edited?.scheduledTime, 1) ?? 0);
  const [reminder, setReminder] = useState<number | null>(
    edited === null ? 60 : edited.reminderOffsetMinutes,
  );

  const scheduledTime = allDay
    ? null
    : `${String(hour ?? 0).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}`;
  const dates = repeat ? generateRecurringDates(startDate, weekdays, weeks) : [startDate];

  const saveEdit = () => {
    if (editedId === null || edited === null) return;
    let previousDate: string | null;
    try {
      previousDate = updateScheduled(db, editedId, {
        scheduledDate: startDate,
        scheduledTime,
        reminderOffsetMinutes: reminder,
      });
    } catch (e) {
      if (e instanceof ScheduleConflictError) {
        Alert.alert('Termin zajęty', e.message);
        return;
      }
      throw e;
    }
    void syncWorkoutReminders();

    // Termin wpisany do kalendarza Garmina przenosimy i tam. Rozmowa z Garminem trwa, a
    // kalendarz w telefonie jest już przesunięty, więc nie zatrzymujemy na niej ekranu.
    const scheduleId = edited.garminScheduleId;
    if (scheduleId !== null && previousDate !== null && previousDate !== startDate) {
      void moveGarminSchedule({
        scheduledId: editedId,
        planId: edited.planId,
        scheduleId,
        fromDate: previousDate,
        toDate: startDate,
      }).then(reportMove);
    }
    router.back();
  };

  const save = () => {
    if (planId === null) {
      Alert.alert('Wybierz plan', 'Najpierw utwórz plan albo skopiuj szablon.');
      return;
    }
    if (dates.length === 0) {
      Alert.alert('Wybierz dni', 'Zaznacz przynajmniej jeden dzień tygodnia.');
      return;
    }
    const added = scheduleWorkouts(db, {
      planId,
      dates,
      scheduledTime,
      reminderOffsetMinutes: reminder,
    });
    void syncWorkoutReminders();
    if (added === 0) {
      Alert.alert('Nic nie dodano', 'Te terminy są już w kalendarzu.');
      return;
    }
    router.back();
  };

  if (plans.length === 0) {
    return (
      <ThemedView style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          Nie masz jeszcze żadnego planu. Utwórz plan lub skopiuj szablon na zakładce „Plany”.
        </ThemedText>
        <Button label="Wróć" variant="secondary" onPress={() => router.back()} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: edited === null ? 'Zaplanuj trening' : 'Przesuń termin' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {edited !== null && (
          <ThemedView type="backgroundElement" style={styles.summary}>
            <ThemedText type="smallBold">{edited.planTitle}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Przesuwasz istniejący termin. Plan zostaje ten sam — żeby zaplanować inny, dodaj
              nowy termin.
            </ThemedText>
          </ThemedView>
        )}

        {edited === null && (
        <Field label="Plan">
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Szukaj po nazwie"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[
              styles.search,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            ]}
          />
          {groups.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {`Nic nie pasuje do „${search.trim()}”.`}
            </ThemedText>
          )}
          {groups.map((group) => (
            <View key={group.sport} style={styles.group}>
              <ThemedText type="small" themeColor="textSecondary">
                {SPORT_LABELS[group.sport]}
              </ThemedText>
              <View style={styles.chips}>
                {group.items.map((plan) => (
                  <Chip
                    key={plan.id}
                    label={plan.title}
                    selected={planId === plan.id}
                    onPress={() => setPickedPlanId(plan.id)}
                  />
                ))}
              </View>
            </View>
          ))}
        </Field>
        )}

        <Field label={edited === null && repeat ? 'Początek cyklu' : 'Dzień'}>
          <View style={styles.dateRow}>
            <Button label="−1 dzień" variant="secondary" onPress={() => setStartDate((d) => addDays(d, -1))} />
            <Button label="+1 dzień" variant="secondary" onPress={() => setStartDate((d) => addDays(d, 1))} />
          </View>
          <ThemedText type="smallBold">{formatDayWithWeekday(startDate)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(startDate)}
          </ThemedText>
        </Field>

        {edited === null && (
          <Field label="Powtarzanie">
            <View style={styles.chips}>
              <Chip label="Jednorazowo" selected={!repeat} onPress={() => setRepeat(false)} />
              <Chip label="Cyklicznie" selected={repeat} onPress={() => setRepeat(true)} />
            </View>
          </Field>
        )}

        {edited === null && repeat && (
          <>
            <Field label="Dni tygodnia">
              <View style={styles.chips}>
                {WEEKDAYS_SHORT.map((day, index) => (
                  <Chip
                    key={day}
                    label={day}
                    selected={weekdays.includes(index)}
                    onPress={() => setWeekdays((w) => toggleValue(w, index))}
                  />
                ))}
              </View>
            </Field>
            <Field label="Przez ile tygodni">
              <View style={styles.chips}>
                {WEEK_OPTIONS.map((value) => (
                  <Chip
                    key={value}
                    label={`${value} tyg.`}
                    selected={weeks === value}
                    onPress={() => setWeeks(value)}
                  />
                ))}
              </View>
            </Field>
          </>
        )}

        <Field label="Godzina">
          <View style={styles.chips}>
            <Chip label="O godzinie" selected={!allDay} onPress={() => setAllDay(false)} />
            <Chip label="Cały dzień" selected={allDay} onPress={() => setAllDay(true)} />
          </View>
          {!allDay && (
            <View style={styles.timeRow}>
              <CompactNumberInput value={hour} suffix="godz." onChange={(v) => setHour(clamp(v, 23))} />
              <CompactNumberInput value={minute} suffix="min" onChange={(v) => setMinute(clamp(v, 59))} />
            </View>
          )}
        </Field>

        <Field label="Przypomnienie przed treningiem">
          <View style={styles.chips}>
            {REMINDER_OPTIONS.map((option) => (
              <Chip
                key={option.label}
                label={option.label}
                selected={reminder === option.minutes}
                onPress={() => setReminder(option.minutes)}
              />
            ))}
          </View>
        </Field>

        {edited === null && (
          <ThemedView type="backgroundElement" style={styles.summary}>
            <ThemedText type="small" themeColor="textSecondary">
              {dates.length === 0
                ? 'Zaznacz dni tygodnia, aby zobaczyć terminy.'
                : `Zostanie dodanych terminów: ${dates.length}. Pierwszy: ${formatDate(dates[0])}${
                    dates.length > 1 ? `, ostatni: ${formatDate(dates[dates.length - 1])}` : ''
                  }.`}
            </ThemedText>
          </ThemedView>
        )}

        {edited === null ? (
          <Button label="Zaplanuj" icon="check" onPress={save} disabled={dates.length === 0} />
        ) : (
          <Button label="Zapisz zmiany" icon="check" onPress={saveEdit} />
        )}
        <Button label="Anuluj" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

/** Co powiedzieć o kalendarzu Garmina po przesunięciu terminu. Milczymy tylko wtedy, gdy się udało. */
function reportMove(outcome: MoveOutcome): void {
  switch (outcome.kind) {
    case 'MOVED':
    case 'NOT_CONNECTED':
      return;
    case 'REMOVED_ONLY':
      Alert.alert(
        'Kalendarz Garmina niepełny',
        `Stary wpis zdjęliśmy, ale nowego nie udało się założyć. ${outcome.reason} Wpisz termin ponownie w jego szczegółach.`,
      );
      return;
    case 'LEFT_BEHIND':
      Alert.alert(
        'Wpis został u Garmina',
        `Termin przesunęliśmy w aplikacji, ale w kalendarzu Garmina trening nadal stoi na ${formatDate(outcome.date)}. ${outcome.reason}`,
      );
  }
}

/** „18:30” → 18 albo 30; null, gdy termin jest całodniowy. */
const timePart = (time: string | null | undefined, index: 0 | 1): number | null => {
  const value = time?.split(':')[index];
  return value === undefined ? null : Number(value);
};

const clamp = (value: number | null, max: number) => (value === null ? null : Math.min(Math.max(value, 0), max));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  field: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  group: { gap: Spacing.one },
  search: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  dateRow: { flexDirection: 'row', gap: Spacing.two },
  timeRow: { flexDirection: 'row', gap: Spacing.three },
  summary: { borderRadius: 12, padding: Spacing.three },
});
