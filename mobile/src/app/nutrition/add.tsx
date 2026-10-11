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
import { type MealType, mealTypes } from '@/db/schema';
import { formatKcal } from '@/features/nutrition/format';
import { MEAL_LABELS, mealByHour } from '@/features/nutrition/meal';
import { logMeal, type MealEntry, MealError, recentMeals } from '@/features/nutrition/repository';
import { useTheme } from '@/hooks/use-theme';

/**
 * Posiłek z ręki: nazwa, kalorie, białko. Bez bazy produktów — ta dojdzie później, a dzień trzeba
 * dać się zapisać już teraz, choćby „na oko”.
 *
 * Na górze stoi to, co jadło się ostatnio. Je się w kółko to samo, więc jedno dotknięcie w tę
 * listę ma wypełnić cały formularz — to ona decyduje, czy liczenie przeżyje drugi tydzień.
 */
export default function AddMealScreen() {
  const theme = useTheme();
  const [recent] = useState(() => recentMeals(db, 10));
  const [meal, setMeal] = useState<MealType>(() => mealByHour(new Date()));
  const [title, setTitle] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [grams, setGrams] = useState<number | null>(null);

  const fill = (entry: MealEntry) => {
    setTitle(entry.title);
    setKcal(entry.kcal);
    setProtein(entry.proteinG);
    setCarbs(entry.carbsG);
    setFat(entry.fatG);
    setGrams(entry.grams);
  };

  const save = () => {
    try {
      logMeal(db, {
        meal,
        title,
        kcal: kcal ?? 0,
        proteinG: protein,
        carbsG: carbs,
        fatG: fat,
        grams,
      });
      router.back();
    } catch (e) {
      Alert.alert('Nie zapisano', e instanceof MealError ? e.message : 'Nieznany błąd.');
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            POSIŁEK
          </ThemedText>
          <View style={styles.chips}>
            {mealTypes.map((type) => (
              <Chip
                key={type}
                label={MEAL_LABELS[type]}
                selected={meal === type}
                onPress={() => setMeal(type)}
              />
            ))}
          </View>
        </View>

        {recent.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              OSTATNIO JEDZONE
            </ThemedText>
            <View style={styles.chips}>
              {recent.map((entry) => (
                <Chip
                  key={entry.id}
                  label={`${entry.title} · ${formatKcal(entry.kcal)}`}
                  selected={false}
                  onPress={() => fill(entry)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CO TO BYŁO
          </ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="np. owsianka z bananem"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            ]}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            WARTOŚCI
          </ThemedText>
          <View style={styles.row}>
            <NumberField label="Kalorie" value={kcal} onChange={setKcal} placeholder="kcal" />
            <NumberField label="Białko (g)" value={protein} onChange={setProtein} decimal placeholder="–" />
          </View>
          <View style={styles.row}>
            <NumberField label="Węgle (g)" value={carbs} onChange={setCarbs} decimal placeholder="–" />
            <NumberField label="Tłuszcz (g)" value={fat} onChange={setFat} decimal placeholder="–" />
            <NumberField label="Masa (g)" value={grams} onChange={setGrams} decimal placeholder="–" />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Kalorie są obowiązkowe, resztę wpisz, jeśli wiesz. Białko warto — na nim stoi cel dnia
            obok kalorii. Węgle i tłuszcz tylko zliczamy, żeby kiedyś dało się je pokazać bez
            przeliczania historii.
          </ThemedText>
        </View>

        <Button label="Zapisz posiłek" icon="check" onPress={save} />
        <Button label="Anuluj" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
