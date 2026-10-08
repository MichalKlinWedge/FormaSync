import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { ExerciseLink } from '@/features/exercises/exercise-link';
import {
  applyProgression,
  type ProgressionAdvice,
  proposeProgression,
  type Suggestion,
} from '@/features/progress/progression';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/date';
import { formatKg } from '@/lib/number';

const ADVICE_LABELS: Record<ProgressionAdvice, string> = {
  INCREASE: 'więcej',
  HOLD: 'bez zmian',
  DECREASE: 'mniej',
};

/** Przegląd i zatwierdzenie sugerowanych ciężarów na kolejny tydzień. */
export default function ProgressionScreen() {
  const theme = useTheme();
  const planId = Number(useLocalSearchParams<{ id: string }>().id);
  const [proposal] = useState(() => proposeProgression(db, planId));
  // Domyślnie zaznaczamy tylko realne zmiany — „bez zmian” nie ma czego zapisywać.
  const [accepted, setAccepted] = useState<number[]>(
    () =>
      proposal?.suggestions
        .filter((s) => s.advice !== 'HOLD')
        .map((s) => s.planExerciseId) ?? [],
  );

  if (!proposal) return <ThemedView style={styles.flex} />;

  const actionable = proposal.suggestions.filter((s) => s.advice !== 'HOLD');

  const apply = () => {
    applyProgression(
      db,
      proposal.suggestions.filter((s) => accepted.includes(s.planExerciseId) && s.advice !== 'HOLD'),
    );
    router.back();
  };

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Na podstawie treningu z {formatDateTime(proposal.basedOn)}. Sugestie są zachowawcze — zatwierdź tylko
          to, co ma sens.
        </ThemedText>

        {proposal.suggestions.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              Nie ma czego sugerować. Reguły działają dla ćwiczeń z ciężarem i celem powtórzeń.
            </ThemedText>
          </ThemedView>
        ) : (
          <View style={styles.list}>
            {proposal.suggestions.map((suggestion) => (
              <SuggestionRow
                key={suggestion.planExerciseId}
                suggestion={suggestion}
                selected={accepted.includes(suggestion.planExerciseId)}
                onToggle={() =>
                  setAccepted((current) =>
                    current.includes(suggestion.planExerciseId)
                      ? current.filter((id) => id !== suggestion.planExerciseId)
                      : [...current, suggestion.planExerciseId],
                  )
                }
              />
            ))}
          </View>
        )}

        {actionable.length > 0 && (
          <Button
            label={`Zapisz w planie (${accepted.filter((id) => actionable.some((s) => s.planExerciseId === id)).length})`}
            icon="check"
            onPress={apply}
            disabled={!accepted.some((id) => actionable.some((s) => s.planExerciseId === id))}
          />
        )}
        <Button
          label={actionable.length > 0 ? 'Anuluj' : 'Zamknij'}
          variant="secondary"
          onPress={() => router.back()}
        />
      </ScrollView>
      <View style={[styles.footnote, { borderTopColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">
          RPE to ocena wysiłku w skali 1–10: 7 oznacza „zostały jeszcze 3 powtórzenia w zapasie”, 10 — maksimum.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

function SuggestionRow({
  suggestion,
  selected,
  onToggle,
}: {
  suggestion: Suggestion;
  selected: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const hold = suggestion.advice === 'HOLD';
  const color = hold ? theme.textSecondary : suggestion.advice === 'INCREASE' ? theme.success : theme.accent;

  return (
    <Pressable
      disabled={hold}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: hold ? 0.6 : pressed ? 0.7 : 1 },
      ]}>
      <Icon
        name={hold ? 'remove' : selected ? 'check_circle' : 'radio_button_unchecked'}
        size={24}
        color={selected && !hold ? theme.accent : theme.textSecondary}
      />
      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.rowName}>
            {suggestion.exerciseName}
          </ThemedText>
          <ExerciseLink exerciseId={suggestion.exerciseId} name={suggestion.exerciseName} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {suggestion.reason}
        </ThemedText>
      </View>
      <View style={styles.change}>
        <ThemedText type="smallBold" style={{ color }}>
          {hold ? formatKg(suggestion.currentWeight) : formatKg(suggestion.suggestedWeight)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {ADVICE_LABELS[suggestion.advice]}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.five },
  list: { gap: Spacing.two },
  card: { borderRadius: 14, padding: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  rowName: { flexShrink: 1 },
  rowText: { flex: 1 },
  change: { alignItems: 'flex-end' },
  footnote: { borderTopWidth: StyleSheet.hairlineWidth, padding: Spacing.four },
});
