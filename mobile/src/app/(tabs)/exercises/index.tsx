import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExerciseRow } from '@/components/exercise-row';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { ExerciseFilterBar } from '@/features/exercises/exercise-filter-bar';
import { emptyExerciseFilter, type ExerciseFilter, filterExercises } from '@/features/exercises/filter';
import { useExerciseCatalog } from '@/features/exercises/use-exercise-catalog';
import { useTheme } from '@/hooks/use-theme';

export default function ExercisesScreen() {
  const theme = useTheme();
  const catalog = useExerciseCatalog();
  const [filter, setFilter] = useState<ExerciseFilter>(emptyExerciseFilter);
  const results = useMemo(() => filterExercises(catalog, filter), [catalog, filter]);

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

        <ExerciseFilterBar
          filter={filter}
          onChange={setFilter}
          resultCount={results.length}
          totalCount={catalog.length}
        />

        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ExerciseRow
              item={item}
              onPress={() => router.push({ pathname: '/exercises/[id]', params: { id: item.id } })}
            />
          )}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingTop: Spacing.four, gap: Spacing.two },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
  },
  list: { paddingHorizontal: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  empty: { textAlign: 'center', paddingVertical: Spacing.five },
});
