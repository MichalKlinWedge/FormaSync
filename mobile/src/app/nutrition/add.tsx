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
import { FoodError } from '@/features/nutrition/food';
import { FoodPicker } from '@/features/nutrition/food-picker';
import { listFoods } from '@/features/nutrition/food-repository';
import { MEAL_LABELS, mealByHour } from '@/features/nutrition/meal';
import { logFoodMeal, logMeal, logMealAsFood, MealError } from '@/features/nutrition/repository';
import { useTheme } from '@/hooks/use-theme';

/**
 * Dodanie posiłku dwiema drogami: z własnej bazy albo z ręki.
 *
 * Z bazy jest szybciej, więc to ona stoi pierwsza — ale pusta baza nie może blokować zapisania
 * dnia, a nowe jedzenie zdarza się codziennie. Wpis z ręki domyślnie zostaje produktem, bo właśnie
 * tak ta baza ma rosnąć: samo, przy okazji liczenia, a nie w osobnym zrywie wypełniania.
 */
type Source = 'BASE' | 'OWN';

export default function AddMealScreen() {
  const theme = useTheme();
  const [source, setSource] = useState<Source>(() => (listFoods(db).length > 0 ? 'BASE' : 'OWN'));
  const [meal, setMeal] = useState<MealType>(() => mealByHour(new Date()));
  const [title, setTitle] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [grams, setGrams] = useState<number | null>(null);
  const [remember, setRemember] = useState(true);

  const fromBase = (foodId: number, amount: number) => {
    try {
      logFoodMeal(db, { meal, foodId, amount });
      router.back();
    } catch (e) {
      Alert.alert('Nie zapisano', e instanceof MealError ? e.message : 'Nieznany błąd.');
    }
  };

  const fromHand = () => {
    const input = {
      meal,
      title,
      kcal: kcal ?? 0,
      proteinG: protein,
      carbsG: carbs,
      fatG: fat,
      grams,
    };
    try {
      if (remember) logMealAsFood(db, input);
      else logMeal(db, input);
      router.back();
    } catch (e) {
      Alert.alert(
        'Nie zapisano',
        e instanceof MealError || e instanceof FoodError ? e.message : 'Nieznany błąd.',
      );
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

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            SKĄD
          </ThemedText>
          <View style={styles.chips}>
            <Chip label="Z bazy" selected={source === 'BASE'} onPress={() => setSource('BASE')} />
            <Chip label="Z ręki" selected={source === 'OWN'} onPress={() => setSource('OWN')} />
          </View>
        </View>

        {source === 'BASE' ? (
          <FoodPicker onPick={fromBase} onCreate={() => router.push('/nutrition/food')} />
        ) : (
          <>
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
                WARTOŚCI CAŁEGO POSIŁKU
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
                Kalorie są obowiązkowe, resztę wpisz, jeśli wiesz. Białko warto — na nim stoi cel
                dnia obok kalorii. Węgle i tłuszcz tylko zliczamy, żeby kiedyś dało się je pokazać
                bez przeliczania historii.
              </ThemedText>
            </View>

            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                NA PRZYSZŁOŚĆ
              </ThemedText>
              <View style={styles.chips}>
                <Chip label="Zapisz w bazie" selected={remember} onPress={() => setRemember(true)} />
                <Chip label="Tylko dziś" selected={!remember} onPress={() => setRemember(false)} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Zapisany produkt będzie liczony „na porcję”, bo tyle o nim wiadomo — kalorie całego
                posiłku. Następnym razem wybierzesz go z bazy jednym dotknięciem.
              </ThemedText>
            </View>

            <Button label="Zapisz posiłek" icon="check" onPress={fromHand} />
          </>
        )}

        <Button
          label="Baza produktów"
          icon="list"
          variant="secondary"
          onPress={() => router.push('/nutrition/foods')}
        />
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
