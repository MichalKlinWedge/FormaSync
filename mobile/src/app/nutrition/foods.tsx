import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { foods } from '@/db/schema';
import { describeFood } from '@/features/nutrition/food';
import { listFoods } from '@/features/nutrition/food-repository';
import { useTheme } from '@/hooks/use-theme';

/**
 * Własna baza produktów. Rośnie sama z wpisów „z ręki”, więc ten ekran jest do przeglądania
 * i poprawiania tego, co już w niej jest — a nie do wypełniania jej od zera.
 */
export default function FoodsScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const { data: rows } = useLiveQuery(db.select({ id: foods.id }).from(foods));
  const matching = useMemo(
    () => listFoods(db, search),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane czyta repozytorium
    [rows, search],
  );

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Szukaj po nazwie lub marce"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={[
            styles.search,
            { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
          ]}
        />

        <Button
          label="Nowy produkt"
          icon="add"
          variant="secondary"
          onPress={() => router.push('/nutrition/food')}
        />

        {matching.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {rows.length === 0
              ? 'Baza jest pusta. Wpisz posiłek z ręki na ekranie dodawania — domyślnie zostanie tu zapisany.'
              : `Nic nie pasuje do „${search.trim()}”.`}
          </ThemedText>
        ) : (
          matching.map((food) => (
            <Pressable
              key={food.id}
              onPress={() => router.push({ pathname: '/nutrition/food', params: { id: food.id } })}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
              ]}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {food.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {[food.brand, describeFood(food)].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <Icon name="chevron_right" size={22} color={theme.textSecondary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: Spacing.six },
  search: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: 12, padding: Spacing.three },
  rowText: { flex: 1, gap: Spacing.half },
});
