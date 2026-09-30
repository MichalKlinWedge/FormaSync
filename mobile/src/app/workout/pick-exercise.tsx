import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ExerciseRow } from '@/components/exercise-row';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { ExerciseFilterBar } from '@/features/exercises/exercise-filter-bar';
import { emptyExerciseFilter, type ExerciseFilter, filterExercises, toggleValue } from '@/features/exercises/filter';
import { useExerciseCatalog } from '@/features/exercises/use-exercise-catalog';
import { addSessionExercise, findActiveSessionId } from '@/features/workout/repository';
import { useTheme } from '@/hooks/use-theme';

/** Dodawanie ćwiczeń do trwającej sesji (także treningu rozpoczętego bez planu). */
export default function PickSessionExerciseScreen() {
  const theme = useTheme();
  const catalog = useExerciseCatalog();
  const [sessionId] = useState(() => findActiveSessionId(db));
  const [filter, setFilter] = useState<ExerciseFilter>(emptyExerciseFilter);
  const [selected, setSelected] = useState<number[]>([]);
  const results = useMemo(() => filterExercises(catalog, filter), [catalog, filter]);

  const confirm = () => {
    if (sessionId !== null) for (const id of selected) addSessionExercise(db, sessionId, id);
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
              <ExerciseRow
                item={item}
                onPress={() => setSelected((s) => toggleValue(s, item.id))}
                accessory={
                  position >= 0 ? (
                    <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                      <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                        {position + 1}
                      </ThemedText>
                    </View>
                  ) : (
                    <Icon name="radio_button_unchecked" size={24} color={theme.textSecondary} />
                  )
                }
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
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two },
});
