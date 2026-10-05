import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { CompactNumberInput } from '@/components/compact-number-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { sports } from '@/db/schema';
import { syncWorkoutReminders } from '@/features/calendar/reminders';
import { scheduleWorkouts } from '@/features/calendar/repository';
import { toggleValue } from '@/features/exercises/filter';
import { usePlanList } from '@/features/plans/use-plans';
import { SPORT_LABELS } from '@/features/sports/sport';
import { useActiveSport } from '@/features/sports/sport-store';
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
  const params = useLocalSearchParams<{ date?: string }>();
  const activeSport = useActiveSport();
  const { own, templates } = usePlanList();
  const plans = [...own, ...templates];
  // Kalendarz jest wspólny dla dyscyplin, więc planów nie zawężamy — ale dzielimy je na grupy
  // i aktywną dyscyplinę dajemy na górę. Bez tego lista to ściana nazw, z której nie widać,
  // że bieg czy pływanie w ogóle da się zaplanować.
  const groups = [...sports]
    .sort((a, b) => Number(b === activeSport) - Number(a === activeSport))
    .map((sport) => ({ sport, items: plans.filter((plan) => plan.sport === sport) }))
    .filter((group) => group.items.length > 0);

  const [startDate, setStartDate] = useState(params.date ?? todayKey());
  // Plany dochodzą z zapytania na żywo, więc przy pierwszym rysowaniu lista jest pusta.
  // Wybór trzymamy jako „nic nie kliknięto” i dopiero wyliczamy z niego pierwszy plan.
  const [pickedPlanId, setPickedPlanId] = useState<number | null>(null);
  const planId = pickedPlanId ?? groups[0]?.items[0]?.id ?? null;
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [weeks, setWeeks] = useState(4);
  const [allDay, setAllDay] = useState(false);
  const [hour, setHour] = useState<number | null>(18);
  const [minute, setMinute] = useState<number | null>(0);
  const [reminder, setReminder] = useState<number | null>(60);

  const scheduledTime = allDay
    ? null
    : `${String(hour ?? 0).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}`;
  const dates = repeat ? generateRecurringDates(startDate, weekdays, weeks) : [startDate];

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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Plan">
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

        <Field label={repeat ? 'Początek cyklu' : 'Dzień'}>
          <View style={styles.dateRow}>
            <Button label="−1 dzień" variant="secondary" onPress={() => setStartDate((d) => addDays(d, -1))} />
            <Button label="+1 dzień" variant="secondary" onPress={() => setStartDate((d) => addDays(d, 1))} />
          </View>
          <ThemedText type="smallBold">{formatDayWithWeekday(startDate)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(startDate)}
          </ThemedText>
        </Field>

        <Field label="Powtarzanie">
          <View style={styles.chips}>
            <Chip label="Jednorazowo" selected={!repeat} onPress={() => setRepeat(false)} />
            <Chip label="Cyklicznie" selected={repeat} onPress={() => setRepeat(true)} />
          </View>
        </Field>

        {repeat && (
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

        <ThemedView type="backgroundElement" style={styles.summary}>
          <ThemedText type="small" themeColor="textSecondary">
            {dates.length === 0
              ? 'Zaznacz dni tygodnia, aby zobaczyć terminy.'
              : `Zostanie dodanych terminów: ${dates.length}. Pierwszy: ${formatDate(dates[0])}${
                  dates.length > 1 ? `, ostatni: ${formatDate(dates[dates.length - 1])}` : ''
                }.`}
          </ThemedText>
        </ThemedView>

        <Button label="Zaplanuj" icon="check" onPress={save} disabled={dates.length === 0} />
        <Button label="Anuluj" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

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
  dateRow: { flexDirection: 'row', gap: Spacing.two },
  timeRow: { flexDirection: 'row', gap: Spacing.three },
  summary: { borderRadius: 12, padding: Spacing.three },
});
