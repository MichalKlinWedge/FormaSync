import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { difficultyLevels } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';

import { emptyExerciseFilter, type ExerciseFilter, isFilterActive, toggleValue } from './filter';
import { difficultyLabels } from './labels';
import { useDictionaries } from './use-exercise-catalog';

type ExerciseFilterBarProps = {
  filter: ExerciseFilter;
  onChange: (update: (filter: ExerciseFilter) => ExerciseFilter) => void;
  resultCount: number;
  totalCount: number;
};

/** Wyszukiwarka + rozwijany panel filtrów (partia mięśniowa, sprzęt, poziom) + licznik wyników. */
export function ExerciseFilterBar({ filter, onChange, resultCount, totalCount }: ExerciseFilterBarProps) {
  const theme = useTheme();
  const { categories, equipment } = useDictionaries();
  const [open, setOpen] = useState(false);
  const activeCount = filter.categoryIds.length + filter.equipmentIds.length + filter.difficultyLevels.length;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <ThemedView type="backgroundElement" style={styles.search}>
          <Icon name="search" size={20} color={theme.textSecondary} />
          <TextInput
            value={filter.search}
            onChangeText={(search) => onChange((f) => ({ ...f, search }))}
            placeholder="Szukaj ćwiczenia"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            autoCorrect={false}
            returnKeyType="search"
          />
          {filter.search !== '' && (
            <Pressable onPress={() => onChange((f) => ({ ...f, search: '' }))} hitSlop={8}>
              <Icon name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          )}
        </ThemedView>
        <Pressable
          accessibilityLabel="Filtry"
          onPress={() => setOpen((o) => !o)}
          style={[styles.filterButton, { backgroundColor: activeCount > 0 ? theme.accent : theme.backgroundElement }]}>
          <Icon name="filter_list" size={22} color={activeCount > 0 ? theme.onAccent : theme.text} />
          {activeCount > 0 && (
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              {activeCount}
            </ThemedText>
          )}
        </Pressable>
      </View>

      {open && (
        <View style={styles.panel}>
          <FilterRow label="Partia mięśniowa">
            {categories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={filter.categoryIds.includes(c.id)}
                onPress={() => onChange((f) => ({ ...f, categoryIds: toggleValue(f.categoryIds, c.id) }))}
              />
            ))}
          </FilterRow>
          <FilterRow label="Sprzęt">
            {equipment.map((e) => (
              <Chip
                key={e.id}
                label={e.name}
                selected={filter.equipmentIds.includes(e.id)}
                onPress={() => onChange((f) => ({ ...f, equipmentIds: toggleValue(f.equipmentIds, e.id) }))}
              />
            ))}
          </FilterRow>
          <FilterRow label="Poziom trudności">
            {difficultyLevels.map((level) => (
              <Chip
                key={level}
                label={difficultyLabels[level]}
                selected={filter.difficultyLevels.includes(level)}
                onPress={() => onChange((f) => ({ ...f, difficultyLevels: toggleValue(f.difficultyLevels, level) }))}
              />
            ))}
          </FilterRow>
        </View>
      )}

      <View style={styles.summary}>
        <ThemedText type="small" themeColor="textSecondary">
          {resultCount} z {totalCount}
        </ThemedText>
        {isFilterActive(filter) && (
          <Pressable onPress={() => onChange(() => emptyExerciseFilter)} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              Wyczyść filtry
            </ThemedText>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterRow}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.filterLabel}>
        {label}
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
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
  panel: { gap: Spacing.two },
  filterRow: { gap: Spacing.one },
  filterLabel: { paddingHorizontal: Spacing.four },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.four },
  summary: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.four },
});
