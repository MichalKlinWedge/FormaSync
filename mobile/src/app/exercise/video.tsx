import { eq } from 'drizzle-orm';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { exercises } from '@/db/schema';
import { setExerciseVideo } from '@/features/exercises/repository';
import { VideoUrlError } from '@/features/exercises/video';
import { useTheme } from '@/hooks/use-theme';

/**
 * Przypięcie własnego filmu do ćwiczenia. Osobny ekran, bo formularz ćwiczenia otwiera się tylko
 * dla własnych pozycji, a swój ulubiony film warto móc zapisać także przy ćwiczeniu z katalogu.
 */
export default function ExerciseVideoScreen() {
  const theme = useTheme();
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const exercise = db.select().from(exercises).where(eq(exercises.id, id)).get();
  const [url, setUrl] = useState(() => exercise?.videoUrl ?? '');

  const save = () => {
    try {
      setExerciseVideo(db, id, url);
      router.back();
    } catch (e) {
      if (e instanceof VideoUrlError) Alert.alert('Niepoprawny adres', e.message);
      else throw e;
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <Stack.Screen options={{ title: 'Film instruktażowy' }} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="small" themeColor="textSecondary">
            Wklej adres filmu, który chcesz mieć pod ręką przy ćwiczeniu „{exercise?.name ?? ''}”.
            Puste pole przywraca wyszukiwanie w YouTube po nazwie ćwiczenia.
          </ThemedText>
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
            <Button label="Zapisz" icon="check" onPress={save} />
            {exercise?.videoUrl ? (
              <Button
                label="Usuń przypięty film"
                icon="delete"
                variant="secondary"
                onPress={() => {
                  setExerciseVideo(db, id, '');
                  router.back();
                }}
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
  input: { borderWidth: 1, borderRadius: 10, padding: Spacing.three, fontSize: 16 },
  actions: { gap: Spacing.two },
});
