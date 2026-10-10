import { eq, inArray } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { categories, exerciseMuscles, exercises } from '@/db/schema';

import { MuscleMap } from './muscle-map';

/**
 * Mapa partii dla zestawu ćwiczeń: planu, zapisanego treningu albo pojedynczego ćwiczenia.
 * Partia główna ćwiczenia maluje się na czerwono, dodatkowe na bursztynowo — a gdy ta sama
 * partia jest w jednym ćwiczeniu główna, a w drugim pomocnicza, wygrywa główna, bo mocniejsze
 * zaangażowanie jest tym, co trzeba zobaczyć.
 */
export function MuscleOverview({ exerciseIds }: { exerciseIds: number[] }) {
  const ids = exerciseIds.length > 0 ? exerciseIds : [-1];

  const { data: mainRows } = useLiveQuery(
    db
      .select({ name: categories.name })
      .from(exercises)
      .innerJoin(categories, eq(exercises.categoryId, categories.id))
      .where(inArray(exercises.id, ids)),
    [ids.join(',')],
  );
  const { data: secondaryRows } = useLiveQuery(
    db
      .select({ name: categories.name })
      .from(exerciseMuscles)
      .innerJoin(categories, eq(exerciseMuscles.categoryId, categories.id))
      .where(inArray(exerciseMuscles.exerciseId, ids)),
    [ids.join(',')],
  );

  const { primary, secondary } = useMemo(() => {
    const main = new Set(mainRows.map((row) => row.name));
    const helping = new Set(secondaryRows.map((row) => row.name).filter((name) => !main.has(name)));
    return { primary: main, secondary: helping };
  }, [mainRows, secondaryRows]);

  if (exerciseIds.length === 0) return null;

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        PARTIE MIĘŚNIOWE
      </ThemedText>
      <MuscleMap primary={primary} secondary={secondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three },
});
