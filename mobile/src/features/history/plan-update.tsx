import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { applyPlanUpdate, type PlanUpdateChange, proposePlanUpdate } from './repository';
import { useTheme } from '@/hooks/use-theme';

const FIELD_LABELS: Record<PlanUpdateChange['field'], string> = {
  targetWeight: 'ciężar (kg)',
  targetReps: 'powtórzenia',
  targetDurationSeconds: 'czas serii (s)',
};

/** Przegląd i zatwierdzenie zmian celów w planie na podstawie wykonanego treningu. */
export function PlanUpdate({ sessionId }: { sessionId: number }) {
  const theme = useTheme();
  const [proposal] = useState(() => proposePlanUpdate(db, sessionId));
  const [accepted, setAccepted] = useState<number[]>(() => proposal?.changes.map((_, index) => index) ?? []);

  if (!proposal) return <ThemedView style={styles.flex} />;

  const apply = () => {
    applyPlanUpdate(
      db,
      proposal.changes.filter((_, index) => accepted.includes(index)),
    );
    router.back();
  };

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Cele w planie „{proposal.planTitle}” zostaną ustawione na wartości z ostatniej wykonanej serii.
          Odznacz to, czego nie chcesz zmieniać.
        </ThemedText>

        <View style={styles.list}>
          {proposal.changes.map((change, index) => {
            const on = accepted.includes(index);
            return (
              <Pressable
                key={`${change.planExerciseId}-${change.field}`}
                onPress={() =>
                  setAccepted((current) =>
                    current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
                  )
                }
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                ]}>
                <Icon
                  name={on ? 'check_circle' : 'radio_button_unchecked'}
                  size={24}
                  color={on ? theme.accent : theme.textSecondary}
                />
                <View style={styles.rowText}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {change.exerciseName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {FIELD_LABELS[change.field]}: {change.from ?? '–'} → {change.to}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Button
          label={accepted.length > 0 ? `Zapisz zmiany (${accepted.length})` : 'Nic nie zaznaczono'}
          icon="check"
          onPress={apply}
          disabled={accepted.length === 0}
        />
        <Button label="Anuluj" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
  rowText: { flex: 1 },
});
