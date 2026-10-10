import { eq } from 'drizzle-orm';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { difficultyLevels, exerciseMuscles, exercises, trackingTypes } from '@/db/schema';
import { toggleValue } from '@/features/exercises/filter';
import { deleteExerciseImage, pickExerciseImage } from '@/features/exercises/images';
import { difficultyLabels, trackingTypeLabels } from '@/features/exercises/labels';
import { type ExerciseInput, ExerciseValidationError, saveExercise } from '@/features/exercises/repository';
import { useDictionaries } from '@/features/exercises/use-exercise-catalog';
import { useTheme } from '@/hooks/use-theme';

const emptyInput: ExerciseInput = {
  name: '',
  categoryId: null,
  secondaryCategoryIds: [],
  equipmentId: null,
  difficultyLevel: 'BEGINNER',
  trackingType: 'REPS',
  instructions: null,
  techniqueNotes: null,
  imageUrl: null,
  videoUrl: null,
};

function loadInput(id: number): ExerciseInput {
  const exercise = db.select().from(exercises).where(eq(exercises.id, id)).get();
  if (!exercise) return emptyInput;
  const secondary = db
    .select({ id: exerciseMuscles.categoryId })
    .from(exerciseMuscles)
    .where(eq(exerciseMuscles.exerciseId, id))
    .all();
  return {
    name: exercise.name,
    categoryId: exercise.categoryId,
    secondaryCategoryIds: secondary.map((s) => s.id),
    equipmentId: exercise.equipmentId,
    difficultyLevel: exercise.difficultyLevel,
    trackingType: exercise.trackingType,
    instructions: exercise.instructions,
    techniqueNotes: exercise.techniqueNotes,
    imageUrl: exercise.imageUrl,
    videoUrl: exercise.videoUrl,
  };
}

export default function ExerciseFormScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const editedId = params.id ? Number(params.id) : undefined;
  const { categories, equipment } = useDictionaries();

  const [initial] = useState(() => (editedId ? loadInput(editedId) : emptyInput));
  const [input, setInput] = useState<ExerciseInput>(initial);
  const set = <K extends keyof ExerciseInput>(key: K, value: ExerciseInput[K]) =>
    setInput((i) => ({ ...i, [key]: value }));

  // Zdjęcia skopiowane w tej sesji edycji — niezapisane usuwamy przy zamknięciu formularza.
  const pendingImages = useRef<string[]>([]);
  useEffect(
    () => () => {
      pendingImages.current.forEach(deleteExerciseImage);
    },
    [],
  );

  const pickImage = async () => {
    const uri = await pickExerciseImage();
    if (!uri) return;
    pendingImages.current.push(uri);
    set('imageUrl', uri);
  };

  const save = () => {
    try {
      saveExercise(db, input, editedId);
      pendingImages.current = pendingImages.current.filter((uri) => uri !== input.imageUrl);
      if (initial.imageUrl && initial.imageUrl !== input.imageUrl) deleteExerciseImage(initial.imageUrl);
      router.back();
    } catch (e) {
      if (e instanceof ExerciseValidationError) Alert.alert('Uzupełnij dane', e.message);
      else throw e;
    }
  };

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <Stack.Screen options={{ title: editedId ? 'Edycja ćwiczenia' : 'Nowe ćwiczenie' }} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field label="Nazwa">
            <TextInput
              value={input.name}
              onChangeText={(v) => set('name', v)}
              placeholder="np. Wyciskanie na maszynie"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
            />
          </Field>

          <Field label="Główna partia mięśniowa">
            <ChipGroup>
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={input.categoryId === c.id}
                  onPress={() => set('categoryId', c.id)}
                />
              ))}
            </ChipGroup>
          </Field>

          <Field label="Partie dodatkowe">
            <ChipGroup>
              {categories
                .filter((c) => c.id !== input.categoryId)
                .map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    selected={input.secondaryCategoryIds.includes(c.id)}
                    onPress={() => set('secondaryCategoryIds', toggleValue(input.secondaryCategoryIds, c.id))}
                  />
                ))}
            </ChipGroup>
          </Field>

          <Field label="Sprzęt">
            <ChipGroup>
              {equipment.map((e) => (
                <Chip
                  key={e.id}
                  label={e.name}
                  selected={input.equipmentId === e.id}
                  onPress={() => set('equipmentId', input.equipmentId === e.id ? null : e.id)}
                />
              ))}
            </ChipGroup>
          </Field>

          <Field label="Poziom trudności">
            <ChipGroup>
              {difficultyLevels.map((level) => (
                <Chip
                  key={level}
                  label={difficultyLabels[level]}
                  selected={input.difficultyLevel === level}
                  onPress={() => set('difficultyLevel', level)}
                />
              ))}
            </ChipGroup>
          </Field>

          <Field label="Rejestracja serii">
            <ChipGroup>
              {trackingTypes.map((t) => (
                <Chip
                  key={t}
                  label={trackingTypeLabels[t]}
                  selected={input.trackingType === t}
                  onPress={() => set('trackingType', t)}
                />
              ))}
            </ChipGroup>
          </Field>

          <Field label="Instrukcja (każdy krok w nowej linii)">
            <TextInput
              value={input.instructions ?? ''}
              onChangeText={(v) => set('instructions', v)}
              multiline
              placeholder={'1. Pozycja wyjściowa…\n2. Ruch…'}
              placeholderTextColor={theme.textSecondary}
              style={[inputStyle, styles.multiline]}
            />
          </Field>

          <Field label="Uwagi do techniki">
            <TextInput
              value={input.techniqueNotes ?? ''}
              onChangeText={(v) => set('techniqueNotes', v)}
              multiline
              placeholderTextColor={theme.textSecondary}
              style={[inputStyle, styles.multiline]}
            />
          </Field>

          <Field label="Film instruktażowy (pusty = wyszukiwanie w YouTube)">
            <TextInput
              value={input.videoUrl ?? ''}
              onChangeText={(v) => set('videoUrl', v)}
              placeholder="https://..."
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              keyboardType="url"
              style={inputStyle}
            />
          </Field>

          <Field label="Zdjęcie">
            {input.imageUrl ? (
              <View>
                <Image source={{ uri: input.imageUrl }} style={styles.image} contentFit="cover" />
                <Pressable
                  onPress={() => set('imageUrl', null)}
                  accessibilityLabel="Usuń zdjęcie"
                  style={[styles.removeImage, { backgroundColor: theme.background }]}>
                  <Icon name="close" size={20} color={theme.text} />
                </Pressable>
              </View>
            ) : (
              <Button label="Wybierz z galerii" icon="add_photo_alternate" variant="secondary" onPress={pickImage} />
            )}
          </Field>

          <Button label="Zapisz" icon="check" onPress={save} />
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

function ChipGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  field: { gap: Spacing.two },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.one, fontSize: 16 },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  image: { height: 180, borderRadius: 12 },
  removeImage: { position: 'absolute', top: Spacing.two, right: Spacing.two, borderRadius: 999, padding: Spacing.one },
});
