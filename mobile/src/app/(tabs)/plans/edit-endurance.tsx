import { router, Stack } from 'expo-router';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import type { DurationType, SegmentKind, TargetType } from '@/db/schema';
import {
  childrenOf,
  createRepeatBlock,
  createSegment,
  draftTotals,
  EnduranceDraftError,
  removeSegment,
  SEGMENT_LABELS,
  type SegmentDraft,
  topLevel,
  updateSegment,
} from '@/features/endurance/draft';
import { useEnduranceDraftStore } from '@/features/endurance/draft-store';
import { formatDistance, formatSeconds } from '@/features/endurance/format';
import { saveEndurancePlan } from '@/features/endurance/repository';
import { useTheme } from '@/hooks/use-theme';

const DURATION_LABELS: Record<DurationType, string> = {
  DISTANCE: 'dystans',
  TIME: 'czas',
  OPEN: 'do decyzji',
};

const TARGET_LABELS: Record<TargetType, string> = {
  NONE: 'bez celu',
  PACE: 'tempo',
  HEART_RATE: 'tętno',
};

/** Kreator planu wytrzymałościowego: odcinki, grupy powtórzeń, cel tempa lub tętna. */
export default function EnduranceEditorScreen() {
  const theme = useTheme();
  const draft = useEnduranceDraftStore((s) => s.draft);
  const apply = useEnduranceDraftStore((s) => s.apply);
  const clear = useEnduranceDraftStore((s) => s.clear);

  if (!draft) return <ThemedView style={styles.flex} />;

  const setSegments = (next: (segments: SegmentDraft[]) => SegmentDraft[]) =>
    apply((current) => ({ ...current, segments: next(current.segments) }));

  const save = () => {
    try {
      const id = saveEndurancePlan(db, draft);
      clear();
      if (draft.id === undefined) router.replace({ pathname: '/plans/[id]', params: { id } });
      else router.back();
    } catch (e) {
      if (e instanceof EnduranceDraftError) Alert.alert('Uzupełnij plan', e.message);
      else throw e;
    }
  };

  const totals = draftTotals(draft.segments);
  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <Stack.Screen options={{ title: draft.id === undefined ? 'Nowy plan' : 'Edycja planu' }} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              NAZWA
            </ThemedText>
            <TextInput
              value={draft.title}
              onChangeText={(title) => apply((current) => ({ ...current, title }))}
              placeholder="np. Interwały 5×400"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              OPIS
            </ThemedText>
            <TextInput
              value={draft.description}
              onChangeText={(description) => apply((current) => ({ ...current, description }))}
              placeholder="Po co ten trening…"
              placeholderTextColor={theme.textSecondary}
              style={inputStyle}
            />
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary">
            ODCINKI
          </ThemedText>

          {draft.segments.length === 0 && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                Dodaj rozgrzewkę, blok interwałów i schłodzenie. Każdy odcinek kończy się dystansem,
                czasem albo Twoją decyzją.
              </ThemedText>
            </ThemedView>
          )}

          {topLevel(draft.segments).map((segment) =>
            segment.kind === 'REPEAT' ? (
              <RepeatCard
                key={segment.key}
                group={segment}
                inner={childrenOf(draft.segments, segment.key)}
                onChange={(key, change) => setSegments((s) => updateSegment(s, key, change))}
                onRemove={(key) => setSegments((s) => removeSegment(s, key))}
                onAddInside={(kind) => setSegments((s) => [...s, createSegment(kind, segment.key)])}
              />
            ) : (
              <SegmentCard
                key={segment.key}
                segment={segment}
                onChange={(change) => setSegments((s) => updateSegment(s, segment.key, change))}
                onRemove={() => setSegments((s) => removeSegment(s, segment.key))}
              />
            ),
          )}

          <View style={styles.addRow}>
            <Chip
              label="+ Rozgrzewka"
              selected={false}
              onPress={() => setSegments((s) => [...s, createSegment('WARMUP')])}
            />
            <Chip
              label="+ Interwały"
              selected={false}
              onPress={() => setSegments((s) => [...s, ...createRepeatBlock()])}
            />
            <Chip
              label="+ Odcinek"
              selected={false}
              onPress={() => setSegments((s) => [...s, createSegment('WORK')])}
            />
            <Chip
              label="+ Schłodzenie"
              selected={false}
              onPress={() => setSegments((s) => [...s, createSegment('COOLDOWN')])}
            />
          </View>

          {(totals.meters > 0 || totals.seconds > 0) && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">
                Razem: {totals.meters > 0 ? formatDistance(totals.meters) : '—'}
                {totals.seconds > 0 ? ` · ${formatSeconds(totals.seconds)}` : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Odcinki bez dystansu i czasu nie wchodzą do sumy.
              </ThemedText>
            </ThemedView>
          )}

          <Button label="Zapisz plan" icon="check" onPress={save} />
          <Button
            label="Anuluj"
            variant="secondary"
            onPress={() => {
              clear();
              router.back();
            }}
          />
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

type RepeatCardProps = {
  group: SegmentDraft;
  inner: SegmentDraft[];
  onChange: (key: string, change: Partial<SegmentDraft>) => void;
  onRemove: (key: string) => void;
  onAddInside: (kind: SegmentKind) => void;
};

function RepeatCard({ group, inner, onChange, onRemove, onAddInside }: RepeatCardProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold">Powtórzenia</ThemedText>
        <Button label="Usuń" icon="delete" variant="danger" onPress={() => onRemove(group.key)} />
      </View>
      <NumberField
        label="Ile razy"
        value={group.repeatCount}
        onChange={(repeatCount) => onChange(group.key, { repeatCount })}
      />
      {inner.map((child) => (
        <SegmentCard
          key={child.key}
          segment={child}
          nested
          onChange={(change) => onChange(child.key, change)}
          onRemove={() => onRemove(child.key)}
        />
      ))}
      <View style={styles.addRow}>
        <Chip label="+ Praca" selected={false} onPress={() => onAddInside('WORK')} />
        <Chip label="+ Przerwa" selected={false} onPress={() => onAddInside('RECOVERY')} />
      </View>
    </ThemedView>
  );
}

type SegmentCardProps = {
  segment: SegmentDraft;
  nested?: boolean;
  onChange: (change: Partial<SegmentDraft>) => void;
  onRemove: () => void;
};

function SegmentCard({ segment, nested, onChange, onRemove }: SegmentCardProps) {
  const theme = useTheme();
  return (
    <ThemedView
      type={nested ? 'background' : 'backgroundElement'}
      style={[styles.card, nested && { borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold">{SEGMENT_LABELS[segment.kind]}</ThemedText>
        <Button label="Usuń" icon="delete" variant="danger" onPress={onRemove} />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        Kończy się przez
      </ThemedText>
      <View style={styles.chips}>
        {(['DISTANCE', 'TIME', 'OPEN'] as const).map((type) => (
          <Chip
            key={type}
            label={DURATION_LABELS[type]}
            selected={segment.durationType === type}
            onPress={() => onChange({ durationType: type })}
          />
        ))}
      </View>

      {segment.durationType === 'DISTANCE' && (
        <NumberField
          label="Dystans (m)"
          value={segment.distanceMeters}
          decimal
          onChange={(distanceMeters) => onChange({ distanceMeters })}
        />
      )}
      {segment.durationType === 'TIME' && (
        <NumberField
          label="Czas (s)"
          value={segment.durationSeconds}
          onChange={(durationSeconds) => onChange({ durationSeconds })}
        />
      )}

      <ThemedText type="small" themeColor="textSecondary">
        Cel
      </ThemedText>
      <View style={styles.chips}>
        {(['NONE', 'PACE', 'HEART_RATE'] as const).map((type) => (
          <Chip
            key={type}
            label={TARGET_LABELS[type]}
            selected={segment.targetType === type}
            onPress={() => onChange({ targetType: type })}
          />
        ))}
      </View>

      {segment.targetType === 'PACE' && (
        <View style={styles.pair}>
          <NumberField
            label="Od (s/km)"
            value={segment.targetLow}
            onChange={(targetLow) => onChange({ targetLow })}
          />
          <NumberField
            label="Do (s/km)"
            value={segment.targetHigh}
            onChange={(targetHigh) => onChange({ targetHigh })}
          />
        </View>
      )}
      {segment.targetType === 'HEART_RATE' && (
        <View style={styles.pair}>
          <NumberField
            label="Od (bpm)"
            value={segment.targetLow}
            onChange={(targetLow) => onChange({ targetLow })}
          />
          <NumberField
            label="Do (bpm)"
            value={segment.targetHigh}
            onChange={(targetHigh) => onChange({ targetHigh })}
          />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  field: { gap: Spacing.two },
  input: { borderRadius: 12, padding: Spacing.three, fontSize: 16 },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pair: { flexDirection: 'row', gap: Spacing.three },
});
