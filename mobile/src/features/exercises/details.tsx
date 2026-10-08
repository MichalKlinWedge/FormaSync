import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { categories, equipment, exerciseMuscles, exercises } from '@/db/schema';
import { deleteExerciseImage } from '@/features/exercises/images';
import { difficultyLabels, trackingTypeLabels } from '@/features/exercises/labels';
import { deleteExercise, ExerciseInUseError } from '@/features/exercises/repository';
import { useTheme } from '@/hooks/use-theme';

type ExerciseDetailsProps = {
  id: number;
  /**
   * Edycja i usuwanie tylko w katalogu ćwiczeń. Z planu czy treningu wchodzi się tu po opis,
   * a formularz ćwiczenia jest modalem zakładki katalogu — otwarty stąd zostawiłby po sobie
   * powrót do niewłaściwej gałęzi nawigacji.
   */
  manageable?: boolean;
};

/** Opis ćwiczenia. Wspólny dla trasy w katalogu i dla trasy otwieranej ponad zakładkami. */
export function ExerciseDetails({ id, manageable = false }: ExerciseDetailsProps) {
  const theme = useTheme();

  const { data: rows } = useLiveQuery(
    db
      .select({
        exercise: exercises,
        categoryName: categories.name,
        equipmentName: equipment.name,
      })
      .from(exercises)
      .leftJoin(categories, eq(exercises.categoryId, categories.id))
      .leftJoin(equipment, eq(exercises.equipmentId, equipment.id))
      .where(eq(exercises.id, id)),
    [id],
  );
  const { data: secondary } = useLiveQuery(
    db
      .select({ name: categories.name })
      .from(exerciseMuscles)
      .innerJoin(categories, eq(exerciseMuscles.categoryId, categories.id))
      .where(eq(exerciseMuscles.exerciseId, id)),
    [id],
  );

  const row = rows[0];
  if (!row) return <ThemedView style={styles.container} />;
  const { exercise } = row;

  const steps = exercise.instructions?.split('\n').filter((s) => s.trim()) ?? [];

  const confirmDelete = () =>
    Alert.alert('Usunąć ćwiczenie?', exercise.name, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          try {
            deleteExercise(db, exercise.id);
            deleteExerciseImage(exercise.imageUrl);
            router.back();
          } catch (e) {
            if (e instanceof ExerciseInUseError) {
              Alert.alert(
                'Nie można usunąć',
                `Ćwiczenie jest używane w planach (${e.usage.plans}) lub historii treningów (${e.usage.loggedSets} serii).`,
              );
            } else throw e;
          }
        },
      },
    ]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: exercise.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView type="backgroundElement" style={styles.image}>
          {exercise.imageUrl ? (
            <Image source={{ uri: exercise.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Icon name="fitness_center" size={56} color={theme.textSecondary} />
          )}
        </ThemedView>

        <ThemedText type="subtitle">{exercise.name}</ThemedText>

        <View style={styles.facts}>
          <Fact label="Partia główna" value={row.categoryName} />
          <Fact label="Partie dodatkowe" value={secondary.map((s) => s.name).join(', ') || null} />
          <Fact label="Sprzęt" value={row.equipmentName} />
          <Fact label="Poziom" value={exercise.difficultyLevel ? difficultyLabels[exercise.difficultyLevel] : null} />
          <Fact label="Rejestracja" value={trackingTypeLabels[exercise.trackingType]} />
        </View>

        {steps.length > 0 && (
          <Section title="Instrukcja krok po kroku">
            {steps.map((step, i) => (
              <ThemedText key={i}>{step}</ThemedText>
            ))}
          </Section>
        )}

        {exercise.techniqueNotes && (
          <Section title="Technika">
            <ThemedText>{exercise.techniqueNotes}</ThemedText>
          </Section>
        )}

        {manageable && exercise.isCustom && (
          <View style={styles.actions}>
            <Button
              label="Edytuj"
              icon="edit"
              variant="secondary"
              onPress={() => router.push({ pathname: '/exercises/form', params: { id: exercise.id } })}
            />
            <Button label="Usuń" icon="delete" variant="danger" onPress={confirmDelete} />
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.factLabel}>
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.factValue}>
        {value}
      </ThemedText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  image: {
    height: 200,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  facts: { gap: Spacing.one },
  fact: { flexDirection: 'row', gap: Spacing.three },
  factLabel: { width: 130 },
  factValue: { flex: 1 },
  section: { gap: Spacing.two },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
