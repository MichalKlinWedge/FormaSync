import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ExerciseFilterBar } from '@/features/exercises/exercise-filter-bar';
import { PickExerciseRow } from '@/features/exercises/pick-exercise-row';
import { emptyExerciseFilter, type ExerciseFilter, filterExercises, toggleValue } from '@/features/exercises/filter';
import { useExerciseCatalog } from '@/features/exercises/use-exercise-catalog';
import { addExercises } from '@/features/plans/draft';
import { usePlanDraftStore } from '@/features/plans/draft-store';

/** Wybór wielu ćwiczeń naraz — dodawane do planu w kolejności zaznaczania. */
export default function PickExerciseScreen() {
  const catalog = useExerciseCatalog();
  const apply = usePlanDraftStore((s) => s.apply);
  const [filter, setFilter] = useState<ExerciseFilter>(emptyExerciseFilter);
  const [selected, setSelected] = useState<number[]>([]);
  const results = useMemo(() => filterExercises(catalog, filter), [catalog, filter]);

  const confirm = () => {
    const byId = new Map(catalog.map((e) => [e.id, e]));
    apply((d) => addExercises(d, selected.flatMap((id) => byId.get(id) ?? [])));
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <ExerciseFilterBar
          filter={filter}
          onChange={setFilter}
          resultCount={results.length}
          totalCount={catalog.length}
        />
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          extraData={selected}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const position = selected.indexOf(item.id);
            return (
              <PickExerciseRow
                item={item}
                position={position >= 0 ? position + 1 : null}
                onToggle={() => setSelected((s) => toggleValue(s, item.id))}
              />
            );
          }}
        />
        <View style={styles.footer}>
          <Button
            label={selected.length ? `Dodaj (${selected.length})` : 'Zaznacz ćwiczenia'}
            icon="add"
            onPress={confirm}
            disabled={selected.length === 0}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingTop: Spacing.three, gap: Spacing.two },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four },
  footer: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two },
});
