import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { CompactNumberInput } from '@/components/compact-number-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { estimateOneRepMax, ONE_REP_MAX_REPS_LIMIT } from '@/features/progress/analytics';
import { WEIGHT_STEP } from '@/features/progress/progression';
import { formatKg } from '@/lib/number';

/** Procenty ciężaru maksymalnego typowe dla zakresów powtórzeń (odwrócony wzór Epleya). */
const REP_TARGETS = [1, 2, 3, 5, 6, 8, 10, 12];

const roundToStep = (value: number) => Math.round(value / WEIGHT_STEP) * WEIGHT_STEP;

/** Kalkulator szacowanego ciężaru maksymalnego i ciężarów roboczych na zakresy powtórzeń. */
export default function OneRepMaxScreen() {
  const [weight, setWeight] = useState<number | null>(100);
  const [reps, setReps] = useState<number | null>(5);

  const oneRepMax = weight !== null && reps !== null ? estimateOneRepMax(weight, reps) : null;
  const tooManyReps = reps !== null && reps > ONE_REP_MAX_REPS_LIMIT;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.inputs}>
            <View style={styles.field}>
              <ThemedText type="small" themeColor="textSecondary">
                Podniesiony ciężar
              </ThemedText>
              <CompactNumberInput value={weight} suffix="kg" decimal onChange={setWeight} />
            </View>
            <View style={styles.field}>
              <ThemedText type="small" themeColor="textSecondary">
                Liczba powtórzeń
              </ThemedText>
              <CompactNumberInput value={reps} suffix="powt." onChange={setReps} />
            </View>
          </View>

          <ThemedView type="backgroundElement" style={styles.result}>
            <ThemedText type="small" themeColor="textSecondary">
              Szacowany ciężar maksymalny
            </ThemedText>
            <ThemedText type="subtitle">{oneRepMax === null ? '–' : formatKg(Math.round(oneRepMax))}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {tooManyReps
                ? `Powyżej ${ONE_REP_MAX_REPS_LIMIT} powtórzeń wzór mocno przeszacowuje, więc nie podajemy wyniku.`
                : 'Wzór Epleya. To oszacowanie, nie wynik pomiaru — traktuj je jako punkt odniesienia.'}
            </ThemedText>
          </ThemedView>

          {oneRepMax !== null && (
            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                CIĘŻARY ROBOCZE
              </ThemedText>
              {REP_TARGETS.map((target) => {
                // Odwrócony wzór Epleya: ciężar, przy którym wyjdzie `target` powtórzeń.
                const working = oneRepMax / (1 + target / 30);
                return (
                  <View key={target} style={styles.row}>
                    <ThemedText type="small">{target} powt.</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatKg(roundToStep(working))}
                      {'  ·  '}
                      {Math.round((working / oneRepMax) * 100)}%
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  inputs: { gap: Spacing.three },
  field: { gap: Spacing.one },
  result: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
