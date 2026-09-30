import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { formatClock, summarize } from '@/features/workout/logic';
import { cancelRestEnd } from '@/features/workout/notifications';
import { findActiveSessionId, finishSession } from '@/features/workout/repository';
import { useSession } from '@/features/workout/use-session';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function FinishWorkoutScreen() {
  const theme = useTheme();
  const now = useNow();
  const [sessionId] = useState(() => findActiveSessionId(db));
  const { session } = useSession(sessionId ?? -1);
  const [notes, setNotes] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);

  if (!session) return <ThemedView style={styles.flex} />;

  const summary = summarize(session, now);

  const save = () => {
    finishSession(db, session.id, { userNotes: notes.trim() || null, rpeRating: rpe });
    void cancelRestEnd();
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.stats}>
            <Stat label="Czas" value={formatClock(summary.durationSeconds)} />
            <Stat label="Serie" value={`${summary.completedSets}/${summary.plannedSets}`} />
            <Stat label="Tonaż" value={`${Math.round(summary.tonnage)} kg`} />
          </View>

          {summary.completedSets === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Nie zapisano żadnej wykonanej serii — trening trafi do historii jako pusty.
            </ThemedText>
          )}

          <View style={styles.field}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              JAK BYŁO? (RPE 1–10)
            </ThemedText>
            <View style={styles.chips}>
              {RPE_VALUES.map((value) => (
                <Chip
                  key={value}
                  label={String(value)}
                  selected={rpe === value}
                  onPress={() => setRpe(rpe === value ? null : value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              NOTATKA
            </ThemedText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Co poszło dobrze, co poprawić następnym razem…"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
          </View>

          <Button label="Zapisz trening" icon="check" onPress={save} />
          <Button label="Wróć do treningu" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="smallBold">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.half },
  field: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
