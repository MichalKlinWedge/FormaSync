import { type Href, router, Stack, useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { CompactNumberInput } from '@/components/compact-number-input';
import { Icon } from '@/components/icon';
import { RpeField } from '@/components/rpe-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';

import { EnduranceSessionDetails } from '@/features/endurance/session-details';
import { SessionHealth } from '@/features/health/session-health';
import { isEndurance } from '@/features/sports/sport';
import { formatTarget } from '@/features/plans/draft';
import { type ActiveExercise, type ActiveSet, countSets, formatClock, sessionTonnage } from '@/features/workout/logic';
import {
  activeSessionSport,
  addSet,
  completeSet,
  removeSet,
  type SetValues,
  updateSet,
} from '@/features/workout/repository';
import { useSession } from '@/features/workout/use-session';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/date';

import { deleteSession, loadSessionMeta, proposePlanUpdate, updateSessionMeta } from './repository';

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type SessionDetailsProps = {
  id: number;
  /** Dodatkowe działania ekranu, który osadza ten widok — np. odpięcie od terminu. */
  footer?: ReactNode;
  /**
   * Dokąd prowadzi aktualizacja planu. Ekran żyje w dwóch stosach — historii i kalendarza —
   * a zakładki są natywne, więc skok do cudzego stosu rozbiłby cofanie.
   */
  updatePlanRoute: Href;
};

/** Pełne szczegóły przeprowadzonego treningu: serie, dane zdrowotne, RPE i notatka. */
export function SessionDetails({ id, updatePlanRoute, footer }: SessionDetailsProps) {
  const theme = useTheme();
  const { session, reload } = useSession(id);
  const [meta] = useState(() => loadSessionMeta(db, id));
  const [sessionSport] = useState(() => activeSessionSport(db, id) ?? 'STRENGTH');
  const [notes, setNotes] = useState(meta?.userNotes ?? '');
  const [rpe, setRpe] = useState<number | null>(meta?.rpeRating ?? null);

  // Po powrocie z okna aktualizacji planu odświeżamy cele pokazywane przy ćwiczeniach.
  useFocusEffect(useCallback(() => reload(), [reload]));

  if (!session || !meta) return <ThemedView style={styles.flex} />;
  // Bieg ma odcinki zamiast serii — ten sam ekran nic by o nim nie powiedział.
  if (isEndurance(sessionSport)) return <EnduranceSessionDetails id={id} footer={footer} />;

  const { completed } = countSets(session.exercises);
  const tonnage = sessionTonnage(session.exercises);

  const saveMeta = (values: { userNotes?: string | null; rpeRating?: number | null }) =>
    updateSessionMeta(db, id, values);

  const confirmDelete = () =>
    Alert.alert('Usunąć trening z historii?', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deleteSession(db, id);
          router.back();
        },
      },
    ]);

  const openPlanUpdate = () => {
    const proposal = proposePlanUpdate(db, id);
    if (!proposal) {
      Alert.alert('Brak planu do aktualizacji', 'Ten trening nie pochodzi z własnego planu.');
      return;
    }
    if (proposal.changes.length === 0) {
      Alert.alert('Plan jest aktualny', `„${proposal.planTitle}” ma już te same cele co ten trening.`);
      return;
    }
    router.push(updatePlanRoute);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <Stack.Screen options={{ title: session.title }} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <ThemedText type="subtitle">{session.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDateTime(session.startTime)}
            </ThemedText>
          </View>

          <View style={styles.stats}>
            <Stat label="Czas" value={meta.totalDurationSeconds !== null ? formatClock(meta.totalDurationSeconds) : '–'} />
            <Stat label="Serie" value={String(completed)} />
            <Stat label="Tonaż" value={`${Math.round(tonnage)} kg`} />
          </View>

          {session.exercises.map((exercise) => (
            <ThemedView key={exercise.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{exercise.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                plan: {formatTarget(exercise)}
              </ThemedText>
              {exercise.sets.map((set) => (
                <HistorySetRow
                  key={set.id}
                  exercise={exercise}
                  set={set}
                  onEdit={(values) => updateSet(db, set.id, values)}
                  onEditEnd={reload}
                  onRemove={() => {
                    removeSet(db, set.id);
                    reload();
                  }}
                />
              ))}
              <Pressable
                onPress={() => {
                  completeSet(db, addSet(db, exercise.id));
                  reload();
                }}
                style={styles.addSet}
                hitSlop={4}>
                <Icon name="add" size={18} color={theme.accent} />
                <ThemedText type="small" style={{ color: theme.accent }}>
                  Dodaj serię
                </ThemedText>
              </Pressable>
            </ThemedView>
          ))}

          <SessionHealth sessionId={id} startTime={session.startTime} />

          <View style={styles.field}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              OCENA RPE
            </ThemedText>
            <View style={styles.chips}>
              {RPE_VALUES.map((value) => (
                <Chip
                  key={value}
                  label={String(value)}
                  selected={rpe === value}
                  onPress={() => {
                    const next = rpe === value ? null : value;
                    setRpe(next);
                    saveMeta({ rpeRating: next });
                  }}
                />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              UWAGI PO TRENINGU
            </ThemedText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              onEndEditing={() => saveMeta({ userNotes: notes.trim() || null })}
              onBlur={() => saveMeta({ userNotes: notes.trim() || null })}
              multiline
              placeholder="Co poprawić w planie na kolejny raz…"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          </View>

          <Button label="Zaktualizuj plan" icon="edit" onPress={openPlanUpdate} />
          {footer}
          <Button label="Usuń trening" icon="delete" variant="danger" onPress={confirmDelete} />
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function HistorySetRow({
  exercise,
  set,
  onEdit,
  onEditEnd,
  onRemove,
}: {
  exercise: ActiveExercise;
  set: ActiveSet;
  onEdit: (values: SetValues) => void;
  onEditEnd: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  return (
    <View>
      <View style={styles.setRow}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.setNumber}>
          {set.setNumber}
        </ThemedText>
        {exercise.trackingType === 'TIME' ? (
          <CompactNumberInput
            value={set.durationSeconds}
            suffix="s"
            onChange={(v) => onEdit({ durationSeconds: v })}
            onEnd={onEditEnd}
          />
        ) : (
          <CompactNumberInput
            value={set.repsCompleted}
            suffix="powt."
            onChange={(v) => onEdit({ repsCompleted: v })}
            onEnd={onEditEnd}
          />
        )}
        <CompactNumberInput
          value={set.weightKg}
          suffix="kg"
          decimal
          placeholder="–"
          onChange={(v) => onEdit({ weightKg: v })}
          onEnd={onEditEnd}
        />
        <Pressable accessibilityLabel="Usuń serię" onPress={onRemove} hitSlop={6}>
          <Icon name="close" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.setRpe}>
        <RpeField
          value={set.rpe}
          onChange={(rpe) => {
            onEdit({ rpe });
            onEditEnd();
          }}
        />
      </View>
    </View>
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
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  setNumber: { width: 18, textAlign: 'center' },
  setRpe: { paddingBottom: Spacing.one },
  addSet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  field: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
  },
});
