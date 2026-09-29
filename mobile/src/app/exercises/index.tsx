import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { difficultyLevels } from '@/db/schema';
import {
  emptyExerciseFilter,
  type ExerciseFilter,
  type ExerciseListItem,
  filterExercises,
  isFilterActive,
  toggleValue,
} from '@/features/exercises/filter';
import { difficultyLabels } from '@/features/exercises/labels';
import { useDictionaries, useExerciseCatalog } from '@/features/exercises/use-exercise-catalog';
import { useTheme } from '@/hooks/use-theme';

export default function ExercisesScreen() {
  const theme = useTheme();
  const catalog = useExerciseCatalog();
  const { categories, equipment } = useDictionaries();
  const [filter, setFilter] = useState<ExerciseFilter>(emptyExerciseFilter);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const results = useMemo(() => filterExercises(catalog, filter), [catalog, filter]);
  const activeFilterCount =
    filter.categoryIds.length + filter.equipmentIds.length + filter.difficultyLevels.length;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Ćwiczenia</ThemedText>
          <Link href="/exercises/form" asChild>
            <Pressable accessibilityLabel="Dodaj własne ćwiczenie" hitSlop={8}>
              <Icon name="add" size={28} color={theme.accent} />
            </Pressable>
          </Link>
        </View>

        <View style={styles.searchRow}>
          <ThemedView type="backgroundElement" style={styles.search}>
            <Icon name="search" size={20} color={theme.textSecondary} />
            <TextInput
              value={filter.search}
              onChangeText={(search) => setFilter((f) => ({ ...f, search }))}
              placeholder="Szukaj ćwiczenia"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
              autoCorrect={false}
              returnKeyType="search"
            />
            {filter.search !== '' && (
              <Pressable onPress={() => setFilter((f) => ({ ...f, search: '' }))} hitSlop={8}>
                <Icon name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            )}
          </ThemedView>
          <Pressable
            accessibilityLabel="Filtry"
            onPress={() => setFiltersOpen((o) => !o)}
            style={[
              styles.filterButton,
              { backgroundColor: activeFilterCount > 0 ? theme.accent : theme.backgroundElement },
            ]}>
            <Icon name="filter_list" size={22} color={activeFilterCount > 0 ? theme.onAccent : theme.text} />
            {activeFilterCount > 0 && (
              <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                {activeFilterCount}
              </ThemedText>
            )}
          </Pressable>
        </View>

        {filtersOpen && (
          <View style={styles.filters}>
            <FilterRow label="Partia mięśniowa">
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={filter.categoryIds.includes(c.id)}
                  onPress={() => setFilter((f) => ({ ...f, categoryIds: toggleValue(f.categoryIds, c.id) }))}
                />
              ))}
            </FilterRow>
            <FilterRow label="Sprzęt">
              {equipment.map((e) => (
                <Chip
                  key={e.id}
                  label={e.name}
                  selected={filter.equipmentIds.includes(e.id)}
                  onPress={() => setFilter((f) => ({ ...f, equipmentIds: toggleValue(f.equipmentIds, e.id) }))}
                />
              ))}
            </FilterRow>
            <FilterRow label="Poziom trudności">
              {difficultyLevels.map((level) => (
                <Chip
                  key={level}
                  label={difficultyLabels[level]}
                  selected={filter.difficultyLevels.includes(level)}
                  onPress={() =>
                    setFilter((f) => ({ ...f, difficultyLevels: toggleValue(f.difficultyLevels, level) }))
                  }
                />
              ))}
            </FilterRow>
          </View>
        )}

        <View style={styles.summary}>
          <ThemedText type="small" themeColor="textSecondary">
            {results.length} z {catalog.length}
          </ThemedText>
          {isFilterActive(filter) && (
            <Pressable onPress={() => setFilter(emptyExerciseFilter)} hitSlop={8}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                Wyczyść filtry
              </ThemedText>
            </Pressable>
          )}
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <ExerciseRow item={item} />}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              Brak ćwiczeń spełniających kryteria.
            </ThemedText>
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterRow}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {children}
      </ScrollView>
    </View>
  );
}

function ExerciseRow({ item }: { item: ExerciseListItem }) {
  const theme = useTheme();
  const subtitle = [item.categoryName, item.equipmentName].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/exercises/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
      <ThemedView type="backgroundElement" style={styles.thumb}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Icon name="fitness_center" size={22} color={theme.textSecondary} />
        )}
      </ThemedView>
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1}>{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {subtitle}
          {item.difficultyLevel ? ` · ${difficultyLabels[item.difficultyLevel]}` : ''}
          {item.isCustom ? ' · własne' : ''}
        </ThemedText>
      </View>
      <Icon name="chevron_right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingTop: Spacing.four, gap: Spacing.two },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
  },
  searchRow: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.four },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: Spacing.two + Spacing.one },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
  },
  filters: { gap: Spacing.two },
  filterRow: { gap: Spacing.one },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.four },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
  },
  list: { paddingHorizontal: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  rowText: { flex: 1 },
  empty: { textAlign: 'center', paddingVertical: Spacing.five },
});
