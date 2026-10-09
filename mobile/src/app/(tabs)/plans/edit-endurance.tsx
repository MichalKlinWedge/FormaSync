import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import {
  drills,
  type DurationType,
  type SegmentKind,
  type Sport,
  strokes,
  swimEquipment,
  type TargetType,
} from '@/db/schema';
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
import { usePoolLength, usePoolStore } from '@/features/endurance/pool-store';
import {
  COMMON_POOL_LENGTHS,
  DRILL_LABELS,
  EQUIPMENT_LABELS,
  lengths,
  STROKE_LABELS,
} from '@/features/endurance/swim';
import { saveEndurancePlan } from '@/features/endurance/repository';
import { saveLabel, screenTitle } from '@/features/plans/labels';
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
  const params = useLocalSearchParams<{ template?: string }>();
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
        <Stack.Screen options={{ title: screenTitle(draft.id !== undefined, params.template === '1') }} />
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

          {draft.sport === 'SWIMMING' && <PoolLengthPicker />}

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
                sport={draft.sport}
                inner={childrenOf(draft.segments, segment.key)}
                onChange={(key, change) => setSegments((s) => updateSegment(s, key, change))}
                onRemove={(key) => setSegments((s) => removeSegment(s, key))}
                onAddInside={(kind) => setSegments((s) => [...s, createSegment(kind, segment.key)])}
              />
            ) : (
              <SegmentCard
                key={segment.key}
                segment={segment}
                sport={draft.sport}
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
              label="+ Powtórzenia"
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

          <Button label={saveLabel(params.template === '1')} icon="check" onPress={save} />
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
  sport: Sport;
};

function RepeatCard({ group, inner, sport, onChange, onRemove, onAddInside }: RepeatCardProps) {
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
          sport={sport}
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

/** Basen zmienia się rzadziej niż plany, więc to ustawienie, a nie pole planu. */
function PoolLengthPicker() {
  const poolLength = usePoolLength();
  const setPoolLength = usePoolStore((state) => state.setPoolLength);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        Długość basenu
      </ThemedText>
      <View style={styles.chips}>
        {COMMON_POOL_LENGTHS.map((meters) => (
          <Chip
            key={meters}
            label={`${meters} m`}
            selected={poolLength === meters}
            onPress={() => setPoolLength(meters)}
          />
        ))}
      </View>
      <NumberField label="Inna długość (m)" value={poolLength} onChange={(value) => value !== null && setPoolLength(value)} />
      <ThemedText type="small" themeColor="textSecondary">
        Dotyczy wszystkich planów pływackich — dystanse przeliczamy na długości.
      </ThemedText>
    </ThemedView>
  );
}

/** „= 16 długości”; przy dystansie niepodzielnym przez długość basenu nic nie pokazujemy. */
function PoolLengthsHint({ meters }: { meters: number | null }) {
  const poolLength = usePoolLength();
  const count = lengths(meters, poolLength);
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {count === null
        ? `Dystans nie dzieli się równo na długości basenu (${poolLength} m).`
        : `= ${count} × ${poolLength} m`}
    </ThemedText>
  );
}

type SegmentCardProps = {
  segment: SegmentDraft;
  sport: Sport;
  nested?: boolean;
  onChange: (change: Partial<SegmentDraft>) => void;
  onRemove: () => void;
};

function SegmentCard({ segment, sport, nested, onChange, onRemove }: SegmentCardProps) {
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
        <>
          <NumberField
            label="Dystans (m)"
            value={segment.distanceMeters}
            decimal
            onChange={(distanceMeters) => onChange({ distanceMeters })}
          />
          {sport === 'SWIMMING' && <PoolLengthsHint meters={segment.distanceMeters} />}
        </>
      )}
      {segment.durationType === 'TIME' && (
        <NumberField
          label="Czas (s)"
          value={segment.durationSeconds}
          onChange={(durationSeconds) => onChange({ durationSeconds })}
        />
      )}

      {sport === 'SWIMMING' && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Styl
          </ThemedText>
          <View style={styles.chips}>
            {strokes.map((stroke) => (
              <Chip
                key={stroke}
                label={STROKE_LABELS[stroke]}
                selected={(segment.stroke ?? 'ANY') === stroke}
                onPress={() => onChange({ stroke })}
              />
            ))}
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            Sprzęt
          </ThemedText>
          <View style={styles.chips}>
            {/* Kliknięcie w wybrany sprzęt go zdejmuje — odcinek bez sprzętu to stan normalny. */}
            {swimEquipment.map((item) => (
              <Chip
                key={item}
                label={EQUIPMENT_LABELS[item]}
                selected={segment.equipment === item}
                onPress={() => onChange({ equipment: segment.equipment === item ? null : item })}
              />
            ))}
          </View>

          {/* Nie „Technika”: tak nazywa się już jeden ze stylów i dwie sąsiednie kontrolki
              o tej samej nazwie myliłyby się nawzajem. */}
          <ThemedText type="small" themeColor="textSecondary">
            Rodzaj pracy
          </ThemedText>
          <View style={styles.chips}>
            {drills.map((item) => (
              <Chip
                key={item}
                label={DRILL_LABELS[item]}
                selected={segment.drill === item}
                onPress={() => onChange({ drill: segment.drill === item ? null : item })}
              />
            ))}
          </View>
        </>
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
