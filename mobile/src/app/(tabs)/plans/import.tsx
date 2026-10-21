import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { describeShared, parseShared, type SharedPlan, SharedPlanError } from '@/features/plans/share';
import { importPlan } from '@/features/plans/transfer';
import { SPORT_LABELS } from '@/features/sports/sport';
import { useTheme } from '@/hooks/use-theme';

/** Odczytany trening albo powód, dla którego się nie udało. Pusty tekst to jeszcze nie błąd. */
type Reading = { plan: SharedPlan; error: null } | { plan: null; error: string | null };

function read(text: string): Reading {
  if (text.trim() === '') return { plan: null, error: null };
  try {
    return { plan: parseShared(text), error: null };
  } catch (e) {
    return { plan: null, error: e instanceof SharedPlanError ? e.message : 'Nie udało się odczytać tekstu.' };
  }
}

/**
 * Wczytanie treningu od kogoś innego.
 *
 * Tekst wkleja się tutaj, bo tą drogą przyszedł — z komunikatora albo z poczty. Podgląd stoi nad
 * przyciskiem celowo: wklejony tekst wygląda jak zlepek nawiasów i nikt nie zapamiętał, co w nim
 * było, więc zanim cokolwiek wpadnie do planów, ekran mówi, co to właściwie jest.
 */
export default function ImportPlanScreen() {
  const theme = useTheme();
  const [text, setText] = useState('');
  const { plan, error } = read(text);

  const add = () => {
    if (plan === null) return;
    try {
      const result = importPlan(db, plan);
      const notes = [
        result.added.length === 0
          ? null
          : `Dopisane do katalogu: ${result.added.join(', ')}.`,
        result.mismatched.length === 0
          ? null
          : `Inny rodzaj pomiaru niż u Ciebie — sprawdź liczby: ${result.mismatched.join(', ')}.`,
      ].filter((note) => note !== null);

      Alert.alert('Wczytane', [`Plan „${result.title}” jest w Twoich planach.`, ...notes].join('\n\n'), [
        {
          text: 'Pokaż',
          onPress: () =>
            router.replace({ pathname: '/plans/[id]', params: { id: String(result.planId) } }),
        },
      ]);
    } catch (e) {
      // Zapis planu ma własne komunikaty o tym, czego nie da się wykonać — i są konkretniejsze
      // niż cokolwiek, co dałoby się napisać tutaj.
      Alert.alert('Nie udało się wczytać', (e as Error).message);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          Wklej tekst, który dostałeś od kogoś z tą samą aplikacją. Może być razem ze zdaniem wokół —
          trening wyłuskamy z niego sami.
        </ThemedText>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Wklej tutaj"
          placeholderTextColor={theme.textSecondary}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        />

        {error !== null && (
          <ThemedText type="small" style={{ color: theme.accent }}>
            {error}
          </ThemedText>
        )}

        {plan !== null && (
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              DO WCZYTANIA
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{plan.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`${SPORT_LABELS[plan.sport]} · ${describeShared(plan)}`}
              </ThemedText>
              {plan.description !== null && (
                <ThemedText type="small" themeColor="textSecondary">
                  {plan.description}
                </ThemedText>
              )}
              {plan.exercises.length > 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  {plan.exercises.map((exercise) => exercise.name).join(' · ')}
                </ThemedText>
              )}
            </ThemedView>
            <Button label="Dodaj do moich planów" icon="library_add" onPress={add} />
            <ThemedText type="small" themeColor="textSecondary">
              {plan.exercises.length > 0
                ? 'Ćwiczenia rozpoznajemy po nazwach w Twoim katalogu; te, których w nim nie ma,'
                  + ' dopiszemy jako Twoje własne. Ciężary i czasy wchodzą takie, jakie są'
                  + ' w treningu — to liczby autora, nie Twoje.'
                : 'Odcinki wchodzą takie, jakie są w treningu — tempa i dystanse są autora,'
                  + ' nie Twoje.'}
            </ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 15,
    minHeight: 140,
    textAlignVertical: 'top',
  },
});
