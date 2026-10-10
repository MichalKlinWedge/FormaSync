import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import type { Sport } from '@/db/schema';
import { formatDistance, formatSeconds } from '@/features/endurance/format';
import { GOAL_SPORTS } from '@/features/goals/planner';
import { GoalValidationError, saveGoal } from '@/features/goals/repository';
import { useCurrentForm } from '@/features/goals/use-goals';
import { toggleValue } from '@/features/exercises/filter';
import { SPORT_LABELS } from '@/features/sports/sport';
import { useTheme } from '@/hooks/use-theme';
import { formatDayWithWeekday, todayKey, WEEKDAYS_SHORT } from '@/lib/date';

/** Najczęstsze dystanse startowe. Reszta wchodzi polem obok. */
const PRESETS: Partial<Record<Sport, { label: string; meters: number }[]>> = {
  RUNNING: [
    { label: '5 km', meters: 5000 },
    { label: '10 km', meters: 10000 },
    { label: 'półmaraton', meters: 21097 },
    { label: 'maraton', meters: 42195 },
  ],
  CYCLING: [
    { label: '50 km', meters: 50000 },
    { label: '100 km', meters: 100000 },
    { label: '160 km', meters: 160000 },
  ],
  SWIMMING: [
    { label: '1 km', meters: 1000 },
    { label: '1,9 km', meters: 1900 },
    { label: '3,8 km', meters: 3800 },
  ],
};

export default function NewGoalScreen() {
  const theme = useTheme();
  const [sport, setSport] = useState<Sport>('RUNNING');
  const [title, setTitle] = useState('');
  const [meters, setMeters] = useState<number | null>(21097);
  const [day, setDay] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(new Date().getFullYear());
  const [hours, setHours] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  // Domyślnie wtorek, czwartek i weekend: trzy jednostki w tygodniu plus długa.
  const [weekDays, setWeekDays] = useState<number[]>([1, 3, 5]);
  const form = useCurrentForm(sport);

  const eventDate =
    day === null || month === null || year === null
      ? null
      : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const validDate = eventDate !== null && !Number.isNaN(Date.parse(`${eventDate}T00:00:00`));

  const targetSeconds =
    hours === null && minutes === null ? null : (hours ?? 0) * 3600 + (minutes ?? 0) * 60;

  const save = () => {
    try {
      const id = saveGoal(db, {
        sport,
        title,
        eventDate: eventDate ?? '',
        distanceMeters: meters ?? 0,
        targetSeconds: targetSeconds === 0 ? null : targetSeconds,
        weekDays,
        notes: null,
      });
      router.replace({ pathname: '/goal/[id]', params: { id } });
    } catch (e) {
      Alert.alert(
        'Nie udało się zapisać',
        e instanceof GoalValidationError ? e.message : 'Nieznany błąd.',
      );
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            DYSCYPLINA
          </ThemedText>
          <View style={styles.chips}>
            {GOAL_SPORTS.map((item) => (
              <Chip
                key={item}
                label={SPORT_LABELS[item]}
                selected={sport === item}
                onPress={() => {
                  setSport(item);
                  setMeters(PRESETS[item]?.[0].meters ?? null);
                }}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            ZAWODY
          </ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="np. Półmaraton Wrocław"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
          />
          <View style={styles.row}>
            <View style={styles.cell}>
              <NumberField label="Dzień" value={day} onChange={setDay} placeholder="7" />
            </View>
            <View style={styles.cell}>
              <NumberField label="Miesiąc" value={month} onChange={setMonth} placeholder="2" />
            </View>
            <View style={styles.cell}>
              <NumberField label="Rok" value={year} onChange={setYear} />
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {validDate ? formatDayWithWeekday(eventDate) : 'Podaj datę startu.'}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            DYSTANS
          </ThemedText>
          <View style={styles.chips}>
            {(PRESETS[sport] ?? []).map((preset) => (
              <Chip
                key={preset.meters}
                label={preset.label}
                selected={meters === preset.meters}
                onPress={() => setMeters(preset.meters)}
              />
            ))}
          </View>
          <NumberField
            label="Dystans w metrach"
            value={meters}
            onChange={setMeters}
            placeholder="21097"
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CZAS DOCELOWY
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Z niego wychodzą tempa wszystkich jednostek. Puste znaczy „chcę dojechać do mety” —
            wtedy tempa bierzemy z Twoich rekordów.
          </ThemedText>
          <View style={styles.row}>
            <View style={styles.cell}>
              <NumberField label="Godziny" value={hours} onChange={setHours} placeholder="1" />
            </View>
            <View style={styles.cell}>
              <NumberField label="Minuty" value={minutes} onChange={setMinutes} placeholder="45" />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            DNI TRENINGOWE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            W ostatni wybrany dzień tygodnia wypadnie długa jednostka — zwykle weekend, kiedy jest
            na nią czas.
          </ThemedText>
          <View style={styles.chips}>
            {WEEKDAYS_SHORT.map((label, index) => (
              <Chip
                key={label}
                label={label}
                selected={weekDays.includes(index)}
                onPress={() => setWeekDays(toggleValue(weekDays, index))}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            TWOJA FORMA
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {form.weeklyMeters === 0
              ? 'Historia nie ma jeszcze treningów tej dyscypliny — plan zacznie ostrożnie, od jednego dystansu zawodów na tydzień.'
              : `Ostatnio ${formatDistance(form.weeklyMeters)} tygodniowo, najdłuższy ${formatDistance(form.longestMeters)}${
                  form.bestPaceSeconds === null
                    ? ''
                    : `, najlepsze tempo ${formatSeconds(form.bestPaceSeconds)}/km`
                }. Od tego plan wystartuje.`}
          </ThemedText>
        </View>

        <Button label="Zapisz i ułóż plan" icon="event" onPress={save} />
        <ThemedText type="small" themeColor="textSecondary">
          Dzisiaj jest {formatDayWithWeekday(todayKey())}.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  cell: { flex: 1 },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
