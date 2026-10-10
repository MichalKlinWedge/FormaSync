import { eq } from 'drizzle-orm';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { exercises } from '@/db/schema';
import { deleteExerciseImage, pickExerciseImage } from '@/features/exercises/images';
import { setExercisePicture } from '@/features/exercises/repository';
import { PictureUrlError } from '@/features/exercises/picture';
import { useTheme } from '@/hooks/use-theme';

/**
 * Własny obrazek ćwiczenia. Podmienia rysunek poglądowy, więc kto ma lepszą ilustrację — rysunek
 * z instruktażu, własne zdjęcie, kadr z filmu — stawia ją na miejscu generowanej sylwetki.
 * Osobny ekran, bo formularz ćwiczenia otwiera się tylko dla własnych pozycji.
 */
export default function ExercisePictureScreen() {
  const theme = useTheme();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const exercise = db.select().from(exercises).where(eq(exercises.id, id)).get();
  const [url, setUrl] = useState(() => exercise?.imageUrl ?? '');

  const apply = (value: string) => {
    try {
      // Stary obrazek kasujemy dopiero po udanym zapisie i tylko wtedy, gdy był nasz.
      const previous = exercise?.imageUrl ?? null;
      setExercisePicture(db, id, value);
      if (previous && previous !== value.trim()) deleteExerciseImage(previous);
      router.back();
    } catch (e) {
      if (e instanceof PictureUrlError) Alert.alert('Niepoprawny adres', e.message);
      else throw e;
    }
  };

  const fromGallery = async () => {
    const uri = await pickExerciseImage();
    if (uri) apply(uri);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <Stack.Screen options={{ title: 'Obrazek ćwiczenia' }} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="textSecondary">
            Własny obrazek zastępuje rysunek poglądowy przy ćwiczeniu „{exercise?.name ?? ''}”.
            Wybierz go z galerii albo wklej adres — puste pole przywraca rysunek.
          </ThemedText>

          {exercise?.imageUrl ? (
            <Image source={{ uri: exercise.imageUrl }} style={styles.preview} contentFit="cover" />
          ) : null}

          <Button label="Wybierz z galerii" icon="add_photo_alternate" onPress={() => void fromGallery()} />

          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://..."
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          />
          <View style={styles.actions}>
            <Button label="Zapisz adres" icon="check" variant="secondary" onPress={() => apply(url)} />
            {exercise?.imageUrl ? (
              <Button
                label="Usuń obrazek"
                icon="delete"
                variant="secondary"
                onPress={() => apply('')}
              />
            ) : null}
          </View>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  preview: { width: '100%', height: 180, borderRadius: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: Spacing.three, fontSize: 16 },
  actions: { gap: Spacing.two },
});
