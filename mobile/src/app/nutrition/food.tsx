import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { type FoodBasis, foodBases } from '@/db/schema';
import { AMOUNT_UNITS, emptyFoodDraft, type FoodDraft, FoodError } from '@/features/nutrition/food';
import { deleteFood, foodDraft, foodUsage, loadFood, saveFood } from '@/features/nutrition/food-repository';
import { useTheme } from '@/hooks/use-theme';
import { pluralWith } from '@/lib/number';

const BASIS_LABELS: Record<FoodBasis, string> = {
  G100: 'na 100 g',
  SERVING: 'na porcję',
};

/**
 * Nowy produkt albo poprawka istniejącego.
 *
 * Najważniejszy wybór jest na górze: czy liczby dotyczą stu gramów, czy jednej porcji. Produkt
 * z opakowania ma na etykiecie to pierwsze, a domowy obiad — to drugie, i udawanie, że wszystko
 * da się podać na sto gramów, kazałoby ważyć miskę zupy.
 */
export default function FoodScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id === undefined ? null : Number(params.id);
  const [draft, setDraft] = useState<FoodDraft>(() => {
    if (id === null) return emptyFoodDraft();
    const food = loadFood(db, id);
    return food === null ? emptyFoodDraft() : foodDraft(food);
  });

  const patch = (change: Partial<FoodDraft>) => setDraft((current) => ({ ...current, ...change }));

  const setPortion = (index: number, change: { name?: string; amount?: number | null }) =>
    setDraft((current) => ({
      ...current,
      portions: current.portions.map((portion, at) =>
        at === index
          ? {
              name: change.name ?? portion.name,
              amount: change.amount === undefined ? portion.amount : (change.amount ?? 0),
            }
          : portion,
      ),
    }));

  const save = () => {
    try {
      saveFood(db, draft, id === null ? {} : { id });
      router.back();
    } catch (e) {
      Alert.alert('Nie zapisano', e instanceof FoodError ? e.message : 'Nieznany błąd.');
    }
  };

  const confirmDelete = () => {
    if (id === null) return;
    const used = foodUsage(db, id);
    Alert.alert(
      'Usunąć produkt?',
      used === 0
        ? draft.name
        : `${draft.name} — w historii ${pluralWith(used, 'wpis', 'wpisy', 'wpisów')}. Zapisane dni zostaną`
          + ' nietknięte, mają własne liczby.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: () => {
            deleteFood(db, id);
            router.back();
          },
        },
      ],
    );
  };

  const unit = draft.basis === 'G100' ? 'na 100 g' : 'w porcji';

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: id === null ? 'Nowy produkt' : 'Produkt' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            NAZWA
          </ThemedText>
          <TextInput
            value={draft.name}
            onChangeText={(name) => patch({ name })}
            placeholder="np. Chleb żytni razowy"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            ]}
          />
          <TextInput
            value={draft.brand ?? ''}
            onChangeText={(brand) => patch({ brand })}
            placeholder="Marka albo skąd (nieobowiązkowe)"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            ]}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CZEGO DOTYCZĄ LICZBY
          </ThemedText>
          <View style={styles.chips}>
            {foodBases.map((basis) => (
              <Chip
                key={basis}
                label={BASIS_LABELS[basis]}
                selected={draft.basis === basis}
                onPress={() => patch({ basis })}
              />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {draft.basis === 'G100'
              ? 'Tak podaje etykieta na opakowaniu. Przy jedzeniu wpisujesz zjedzone gramy.'
              : 'Dla domowego jedzenia: liczby opisują jedną porcję, a przy jedzeniu wpisujesz, ile porcji.'}
          </ThemedText>
        </View>

        {draft.basis === 'SERVING' && (
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              PORCJA
            </ThemedText>
            <View style={styles.row}>
              <View style={styles.cell}>
                <ThemedText type="small" themeColor="textSecondary">
                  Jak ją nazywasz
                </ThemedText>
                <TextInput
                  value={draft.servingName ?? ''}
                  onChangeText={(servingName) => patch({ servingName })}
                  placeholder="miska, sztuka, kubek"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                />
              </View>
              <NumberField
                label="Masa (g)"
                value={draft.servingGrams}
                decimal
                placeholder="–"
                onChange={(servingGrams) => patch({ servingGrams })}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Masa porcji jest nieobowiązkowa i w liczeniu nie uczestniczy — zapisujemy ją tylko
              przy posiłku, żeby w historii było widać, ile tego było.
            </ThemedText>
          </View>
        )}

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {`WARTOŚCI ${unit.toUpperCase()}`}
          </ThemedText>
          <View style={styles.row}>
            <NumberField
              label="Kalorie"
              value={draft.kcal}
              placeholder="kcal"
              onChange={(kcal) => patch({ kcal })}
            />
            <NumberField
              label="Białko (g)"
              value={draft.proteinG}
              decimal
              placeholder="–"
              onChange={(proteinG) => patch({ proteinG })}
            />
          </View>
          <View style={styles.row}>
            <NumberField
              label="Węgle (g)"
              value={draft.carbsG}
              decimal
              placeholder="–"
              onChange={(carbsG) => patch({ carbsG })}
            />
            <NumberField
              label="Tłuszcz (g)"
              value={draft.fatG}
              decimal
              placeholder="–"
              onChange={(fatG) => patch({ fatG })}
            />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            WŁASNE MIARKI
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {draft.basis === 'G100'
              ? 'Żeby nie ważyć za każdym razem: „kromka 35 g”, „moja miarka ryżu 80 g”. Stają się przyciskami przy dodawaniu posiłku.'
              : 'Nazwane ilości porcji, na przykład „pół miski” jako 0,5.'}
          </ThemedText>
          {draft.portions.map((portion, index) => (
            <View key={index} style={styles.row}>
              <View style={styles.cell}>
                <ThemedText type="small" themeColor="textSecondary">
                  Nazwa
                </ThemedText>
                <TextInput
                  value={portion.name}
                  onChangeText={(name) => setPortion(index, { name })}
                  placeholder="kromka"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                />
              </View>
              <NumberField
                label={AMOUNT_UNITS[draft.basis]}
                value={portion.amount}
                decimal
                onChange={(amount) => setPortion(index, { amount })}
              />
              <Pressable
                accessibilityLabel={`Usuń miarkę ${portion.name}`}
                onPress={() =>
                  patch({ portions: draft.portions.filter((_, at) => at !== index) })
                }
                hitSlop={6}
                style={styles.remove}>
                <Icon name="delete" size={22} color={theme.accent} />
              </Pressable>
            </View>
          ))}
          <Button
            label="Dodaj miarkę"
            icon="add"
            variant="secondary"
            onPress={() =>
              patch({
                portions: [
                  ...draft.portions,
                  { name: '', amount: draft.basis === 'G100' ? 100 : 1 },
                ],
              })
            }
          />
        </View>

        <Button label="Zapisz produkt" icon="check" onPress={save} />
        {id !== null && (
          <Button label="Usuń produkt" icon="delete" variant="secondary" onPress={confirmDelete} />
        )}
        <Button label="Anuluj" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' },
  cell: { flex: 1, gap: Spacing.half },
  remove: { paddingBottom: Spacing.two },
});
