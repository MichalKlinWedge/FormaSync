import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { LineChart } from '@/components/charts/line-chart';
import { CompactNumberInput } from '@/components/compact-number-input';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import {
  deleteMeasurement,
  type MeasurementInput,
  MeasurementValidationError,
  saveMeasurement,
} from '@/features/progress/repository';
import { useMeasurements } from '@/features/progress/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatDate, fromDateKey, todayKey } from '@/lib/date';
import { formatNumber } from '@/lib/number';

const FIELDS: { key: keyof MeasurementInput; label: string; suffix: string; decimal?: boolean }[] = [
  { key: 'weightKg', label: 'Waga', suffix: 'kg', decimal: true },
  { key: 'bodyFatPercent', label: 'Tł. tłuszczowa', suffix: '%', decimal: true },
  { key: 'chestCm', label: 'Klatka', suffix: 'cm', decimal: true },
  { key: 'waistCm', label: 'Talia', suffix: 'cm', decimal: true },
  { key: 'hipsCm', label: 'Biodra', suffix: 'cm', decimal: true },
  { key: 'armCm', label: 'Ramię', suffix: 'cm', decimal: true },
  { key: 'thighCm', label: 'Udo', suffix: 'cm', decimal: true },
];

/** Ciśnienie stoi osobno: to para liczb całkowitych w innej jednostce niż reszta pomiarów. */
const PRESSURE_FIELDS: { key: 'systolic' | 'diastolic'; label: string }[] = [
  { key: 'systolic', label: 'Skurczowe' },
  { key: 'diastolic', label: 'Rozkurczowe' },
];

const emptyInput = (date: string): MeasurementInput => ({
  measuredOn: date,
  weightKg: null,
  bodyFatPercent: null,
  chestCm: null,
  waistCm: null,
  hipsCm: null,
  armCm: null,
  thighCm: null,
  systolic: null,
  diastolic: null,
  notes: null,
});

export default function BodyMeasurementsScreen() {
  const theme = useTheme();
  const measurements = useMeasurements();
  const [date, setDate] = useState(todayKey());
  const [input, setInput] = useState<MeasurementInput>(() => emptyInput(todayKey()));
  // Zmiana daty resetuje formularz, więc pola dostają nowy klucz i czyszczą własny tekst.
  const [formKey, setFormKey] = useState(0);

  const weightPoints = [...measurements]
    .reverse()
    .filter((m) => m.weightKg !== null)
    .map((m) => ({ date: m.measuredOn, value: m.weightKg! }));

  const changeDate = (delta: number) => {
    const next = addDays(date, delta);
    setDate(next);
    setInput(emptyInput(next));
    setFormKey((k) => k + 1);
  };

  const save = () => {
    try {
      saveMeasurement(db, { ...input, measuredOn: date });
      setInput(emptyInput(date));
      setFormKey((k) => k + 1);
    } catch (e) {
      if (e instanceof MeasurementValidationError) Alert.alert('Uzupełnij pomiar', e.message);
      else throw e;
    }
  };

  const confirmDelete = (id: number, measuredOn: string) =>
    Alert.alert('Usunąć pomiar?', formatDate(measuredOn), [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => deleteMeasurement(db, id) },
    ]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              WAGA CIAŁA
            </ThemedText>
            <LineChart
              labels={weightPoints.map((p) => shortDate(p.date))}
              series={[{ name: 'Waga', color: theme.chart1, values: weightPoints.map((p) => p.value) }]}
              formatValue={(value) => formatNumber(value, 1)}
              emptyMessage="Zapisz wagę z co najmniej dwóch dni, aby zobaczyć wykres."
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              NOWY POMIAR
            </ThemedText>
            <View style={styles.dateRow}>
              <Button label="−1 dzień" variant="secondary" onPress={() => changeDate(-1)} />
              <Button label="+1 dzień" variant="secondary" onPress={() => changeDate(1)} />
            </View>
            <ThemedText type="smallBold">{formatDate(date)}</ThemedText>

            <View style={styles.fields}>
              {FIELDS.map((field) => (
                <View key={`${field.key}-${formKey}`} style={styles.field}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel} numberOfLines={1}>
                    {field.label}
                  </ThemedText>
                  <CompactNumberInput
                    value={input[field.key] as number | null}
                    suffix={field.suffix}
                    decimal={field.decimal}
                    placeholder="–"
                    onChange={(value) => setInput((current) => ({ ...current, [field.key]: value }))}
                  />
                </View>
              ))}
            </View>

            <ThemedText type="small" themeColor="textSecondary">
              CIŚNIENIE
            </ThemedText>
            <View style={styles.fields}>
              {PRESSURE_FIELDS.map((field) => (
                <View key={`${field.key}-${formKey}`} style={styles.field}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel} numberOfLines={1}>
                    {field.label}
                  </ThemedText>
                  <CompactNumberInput
                    value={input[field.key] as number | null}
                    suffix="mmHg"
                    placeholder="–"
                    onChange={(value) => setInput((current) => ({ ...current, [field.key]: value }))}
                  />
                </View>
              ))}
            </View>

            <Button label="Zapisz pomiar" icon="check" onPress={save} />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              HISTORIA POMIARÓW
            </ThemedText>
            {measurements.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Nie zapisano jeszcze żadnego pomiaru.
              </ThemedText>
            ) : (
              measurements.map((measurement) => (
                <ThemedView key={measurement.id} type="backgroundElement" style={styles.row}>
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold">{formatDate(measurement.measuredOn)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {describe(measurement)}
                    </ThemedText>
                  </View>
                  <Pressable
                    accessibilityLabel="Usuń pomiar"
                    onPress={() => confirmDelete(measurement.id, measurement.measuredOn)}
                    hitSlop={6}>
                    <Icon name="delete" size={20} color={theme.textSecondary} />
                  </Pressable>
                </ThemedView>
              ))
            )}
          </View>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function describe(measurement: Record<string, unknown>): string {
  const parts = FIELDS.map((field) => {
    const value = measurement[field.key];
    return typeof value === 'number' ? `${field.label} ${formatNumber(value, 1)} ${field.suffix}` : null;
  });
  // Ciśnienie czyta się jako jedną wartość „120/80”, a nie jako dwie osobne liczby.
  const { systolic, diastolic } = measurement;
  if (typeof systolic === 'number' && typeof diastolic === 'number') {
    parts.push(`Ciśnienie ${systolic}/${diastolic}`);
  }
  return parts.filter(Boolean).join(' · ') || 'brak wartości';
}

function shortDate(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  dateRow: { flexDirection: 'row', gap: Spacing.two },
  fields: { gap: Spacing.two },
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  fieldLabel: { width: 108 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
  rowText: { flex: 1 },
});
