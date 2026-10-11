import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { foods } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';

import {
  AMOUNT_UNITS,
  describeFood,
  nutrientsFor,
  portionChoices,
  referenceAmount,
  SOURCE_NOTES,
} from './food';
import { listFoods, loadFood } from './food-repository';
import { formatGrams, formatKcal } from './format';

/**
 * Wybór produktu z własnej bazy i zjedzonej ilości.
 *
 * Lista zaczyna się od ostatnio jedzonych, bo je się w kółko to samo — pole szukania jest dla
 * reszty. Po wybraniu produktu widać od razu, ile to wyjdzie kalorii: liczba przed zapisem, a nie
 * po, bo przed nią jeszcze da się zmienić zdanie.
 */

/** Ile wierszy pokazujemy, zanim poprosimy o zawężenie. */
const LIMIT = 12;

type Props = {
  onPick: (foodId: number, amount: number) => void;
  /** Co zrobić, gdy w bazie nic nie pasuje — zwykle przejście do tworzenia produktu. */
  onCreate: () => void;
};

export function FoodPicker({ onPick, onCreate }: Props) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);

  const { data: rows } = useLiveQuery(db.select({ id: foods.id }).from(foods));
  const matching = useMemo(
    () => listFoods(db, search),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane czyta repozytorium
    [rows, search],
  );
  const picked = useMemo(
    () => (pickedId === null ? null : loadFood(db, pickedId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jak wyżej
    [rows, pickedId],
  );

  const choices = picked === null ? [] : portionChoices(picked, picked.portions);

  const pick = (id: number) => {
    setPickedId(id);
    const food = loadFood(db, id);
    if (food === null) return;
    // Pierwsza własna miarka, a bez niej jednostka odniesienia: setka albo jedna porcja.
    setAmount(food.portions[0]?.amount ?? referenceAmount(food.basis));
  };

  const values = picked === null || amount === null ? null : nutrientsFor(picked, amount);

  return (
    <View style={styles.wrap}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Szukaj w bazie produktów"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        style={[
          styles.search,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
        ]}
      />

      {matching.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText type="small" themeColor="textSecondary">
            {search.trim() === ''
              ? 'Baza jest pusta. Każdy wpis z ręki może od razu zostać produktem — wtedy drugi raz wybierzesz go jednym dotknięciem.'
              : `Nic nie pasuje do „${search.trim()}”.`}
          </ThemedText>
          <Button label="Nowy produkt" icon="add" variant="secondary" onPress={onCreate} />
        </View>
      ) : (
        matching.slice(0, LIMIT).map((food) => (
          <Pressable
            key={food.id}
            onPress={() => pick(food.id)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor:
                  food.id === pickedId ? theme.backgroundSelected : theme.backgroundElement,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <View style={styles.rowText}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {food.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {[food.brand, describeFood(food), SOURCE_NOTES[food.source]]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
          </Pressable>
        ))
      )}

      {matching.length > LIMIT && (
        <ThemedText type="small" themeColor="textSecondary">
          {`Pasuje ${matching.length} produktów — zawęź nazwą, żeby zobaczyć dalsze.`}
        </ThemedText>
      )}

      {picked !== null && (
        <View style={styles.amount}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            ILE ZJEDZONE
          </ThemedText>
          <View style={styles.chips}>
            {choices.map((choice) => (
              <Chip
                key={`${choice.name}-${choice.amount}`}
                label={choice.name}
                selected={amount === choice.amount}
                onPress={() => setAmount(choice.amount)}
              />
            ))}
          </View>
          <View style={styles.fields}>
            <NumberField
              label={`Ilość (${AMOUNT_UNITS[picked.basis]})`}
              value={amount}
              decimal
              onChange={setAmount}
            />
            <View style={styles.cell}>
              <ThemedText type="small" themeColor="textSecondary">
                Wyjdzie
              </ThemedText>
              <ThemedText type="smallBold">
                {values === null
                  ? '—'
                  : [
                      formatKcal(values.kcal),
                      values.proteinG === null ? null : `białko ${formatGrams(values.proteinG)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </ThemedText>
            </View>
          </View>
          <Button
            label="Dodaj do dnia"
            icon="check"
            onPress={() => onPick(picked.id, amount as number)}
            disabled={amount === null || amount <= 0}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  search: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  empty: { gap: Spacing.two },
  row: { borderRadius: 12, padding: Spacing.three },
  rowText: { gap: Spacing.half },
  amount: { gap: Spacing.two, paddingTop: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  fields: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' },
  cell: { flex: 1, gap: Spacing.half },
});
