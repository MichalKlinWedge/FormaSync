import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { formatDistance, formatPace } from '@/features/endurance/format';
import { loadEnduranceSession, paceBreakdown, sessionTotals } from '@/features/endurance/session';
import { isEndurance } from '@/features/sports/sport';
import { formatClock, summarize } from '@/features/workout/logic';
import { cancelCountdown } from '@/features/workout/notifications';
import { clearTimedSet } from '@/features/workout/timed-set';
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
  const [endurance] = useState(() =>
    sessionId === null ? null : loadEnduranceSession(db, sessionId),
  );
  const [notes, setNotes] = useState('');
  const [rpe, setRpe] = useState<number | null>(null);

  if (!session) return <ThemedView style={styles.flex} />;

  const summary = summarize(session, now);
  // Bieg podsumowujemy dystansem i tempem; serie i tonaż nic tu nie znaczą.
  const asEndurance = endurance !== null && isEndurance(endurance.sport) ? endurance : null;
  const totals = asEndurance === null ? null : sessionTotals(asEndurance.segments);
  const pace = asEndurance === null ? null : paceBreakdown(asEndurance.segments);

  const save = () => {
    finishSession(db, session.id, { userNotes: notes.trim() || null, rpeRating: rpe });
    clearTimedSet(db);
    void cancelCountdown();
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {totals !== null && asEndurance !== null ? (
            <>
              <View style={styles.stats}>
                <Stat label="Czas" value={formatClock(summary.durationSeconds)} />
                <Stat label="Dystans" value={formatDistance(totals.meters)} />
              </View>
              <View style={styles.stats}>
                <Stat
                  label="Tempo całości"
                  value={pace?.overall == null ? '—' : formatPace(pace.overall)}
                />
                <Stat label="Tempo pracy" value={pace?.work == null ? '—' : formatPace(pace.work)} />
              </View>
              {totals.meters === 0 && totals.seconds === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  Nie zapisano żadnego odcinka — trening trafi do historii jako pusty.
                </ThemedText>
              )}
            </>
          ) : (
            <>
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
            </>
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
