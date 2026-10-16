import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { LineChart } from '@/components/charts/line-chart';
import { CompactNumberInput } from '@/components/compact-number-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { MEASUREMENT_FIELDS, PRESSURE_FIELDS } from '@/features/progress/measurement-fields';
import {
  type MeasurementInput,
  MeasurementValidationError,
  saveMeasurement,
} from '@/features/progress/repository';
import { useMeasurements } from '@/features/progress/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatDate, fromDateKey, todayKey } from '@/lib/date';
import { formatNumber } from '@/lib/number';

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

  // Obie wartości rysujemy tylko z pomiarów, które mają parę — pojedyncza liczba nie trafia
  // do bazy, ale kopia zapasowa z innego źródła mogłaby taką przynieść.
  const pressurePoints = [...measurements]
    .reverse()
    .filter((m) => m.systolic !== null && m.diastolic !== null)
    .map((m) => ({ date: m.measuredOn, systolic: m.systolic!, diastolic: m.diastolic! }));

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
              gridLines={5}
              emptyMessage="Zapisz wagę z co najmniej dwóch dni, aby zobaczyć wykres."
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              CIŚNIENIE
            </ThemedText>
            <LineChart
              labels={pressurePoints.map((p) => shortDate(p.date))}
              series={[
                {
                  name: 'Skurczowe',
                  color: theme.chart1,
                  values: pressurePoints.map((p) => p.systolic),
                },
                {
                  name: 'Rozkurczowe',
                  color: theme.chart2,
                  values: pressurePoints.map((p) => p.diastolic),
                },
              ]}
              formatValue={(value) => String(Math.round(value))}
              gridLines={5}
              emptyMessage="Zapisz ciśnienie z co najmniej dwóch dni, aby zobaczyć wykres."
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
              {MEASUREMENT_FIELDS.map((field) => (
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

          <Button
            label={
              measurements.length === 0
                ? 'Historia pomiarów'
                : `Historia pomiarów (${measurements.length})`
            }
            icon="history"
            variant="secondary"
            onPress={() => router.push('/history/measurements')}
          />
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
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
});
