import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import {
  filterMeasurements,
  KIND_LABELS,
  type MeasurementKind,
  measurementKinds,
  PERIODS,
} from '@/features/progress/measurement-filter';
import { describeMeasurement } from '@/features/progress/measurement-fields';
import { deleteMeasurement } from '@/features/progress/repository';
import { useMeasurements } from '@/features/progress/use-progress';
import { useTheme } from '@/hooks/use-theme';
import { addDays, formatDate, todayKey } from '@/lib/date';
import { pluralWith } from '@/lib/number';

/**
 * Historia pomiarów na żądanie, z zawężaniem.
 *
 * Na ekranie pomiarów lista rosła bez końca pod formularzem i spychała wykresy poza zasięg
 * kciuka — a zagląda się do niej rzadko i zwykle po jedną rzecz: po ostatnie tygodnie albo po
 * dni, w których mierzyło się ciśnienie. Dlatego osobny ekran i dwa filtry zamiast przewijania.
 */
export default function MeasurementsHistoryScreen() {
  const theme = useTheme();
  const measurements = useMeasurements();
  const [kind, setKind] = useState<MeasurementKind>('ALL');
  const [days, setDays] = useState<number | null>(90);

  const from = days === null ? null : addDays(todayKey(), -days);
  const shown = filterMeasurements(measurements, { kind, from });

  const confirmDelete = (id: number, measuredOn: string) =>
    Alert.alert('Usunąć pomiar?', formatDate(measuredOn), [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => deleteMeasurement(db, id) },
    ]);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            OKRES
          </ThemedText>
          <View style={styles.chips}>
            {PERIODS.map((period) => (
              <Chip
                key={period.label}
                label={period.label}
                selected={period.days === days}
                onPress={() => setDays(period.days)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            RODZAJ
          </ThemedText>
          <View style={styles.chips}>
            {measurementKinds.map((option) => (
              <Chip
                key={option}
                label={KIND_LABELS[option]}
                selected={option === kind}
                onPress={() => setKind(option)}
              />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {/* Liczba mówi, czy pusto jest z braku pomiarów, czy z zawężenia. */}
            {measurements.length === 0
              ? 'Nie zapisano jeszcze żadnego pomiaru.'
              : `${pluralWith(shown.length, 'pomiar', 'pomiary', 'pomiarów')} z ${measurements.length}.`}
          </ThemedText>
        </View>

        {shown.map((measurement) => (
          <ThemedView key={measurement.id} type="backgroundElement" style={styles.row}>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">{formatDate(measurement.measuredOn)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {describeMeasurement(measurement)}
              </ThemedText>
              {measurement.notes !== null && measurement.notes.trim() !== '' && (
                <ThemedText type="small" themeColor="textSecondary">
                  {measurement.notes}
                </ThemedText>
              )}
            </View>
            <Pressable
              accessibilityLabel="Usuń pomiar"
              onPress={() => confirmDelete(measurement.id, measurement.measuredOn)}
              hitSlop={6}>
              <Icon name="delete" size={20} color={theme.textSecondary} />
            </Pressable>
          </ThemedView>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
});
