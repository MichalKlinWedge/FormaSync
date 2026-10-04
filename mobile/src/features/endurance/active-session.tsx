import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { elapsedSeconds, formatClock } from '@/features/workout/logic';
import { abandonSession } from '@/features/workout/repository';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

import { SEGMENT_LABELS } from './draft';
import { describeDuration, describeTarget, formatDistance, formatSeconds, paceFrom, formatPace } from './format';
import {
  type ActiveSegment,
  completeSegment,
  loadEnduranceSession,
  sessionTotals,
  uncompleteSegment,
  updateSegmentValues,
} from './session';

/**
 * Trening wytrzymałościowy na żywo. Odcinki idą w kolejności biegu; pierwszy niezapisany jest
 * bieżący. Zatwierdzenie bez wpisywania liczb przyjmuje cel z planu — w biegu nikt nie wpisuje
 * dystansu, a po treningu i tak można poprawić.
 */
export function ActiveEnduranceSession({ sessionId }: { sessionId: number }) {
  useKeepAwake();
  const theme = useTheme();
  const now = useNow();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  void version;

  const session = loadEnduranceSession(db, sessionId);
  if (!session) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Nie ma trwającego treningu.</ThemedText>
        <Button label="Wróć" variant="secondary" onPress={() => router.replace('/')} />
      </ThemedView>
    );
  }

  const done = session.segments.filter((segment) => segment.completedAt !== null).length;
  const currentIndex = session.segments.findIndex((segment) => segment.completedAt === null);
  const totals = sessionTotals(session.segments);

  const toggle = (segment: ActiveSegment) => {
    if (segment.completedAt === null) {
      completeSegment(db, segment.id, {});
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      uncompleteSegment(db, segment.id);
    }
    reload();
  };

  const confirmAbandon = () =>
    Alert.alert('Przerwać trening?', 'Zapisane odcinki zostaną, niezapisane przepadną.', [
      { text: 'Kontynuuj trening', style: 'cancel' },
      {
        text: 'Przerwij',
        style: 'destructive',
        onPress: () => {
          abandonSession(db, session.id);
          router.replace('/');
        },
      },
    ]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {session.title ?? 'Trening'}
            </ThemedText>
            <ThemedText type="title" style={styles.clock}>
              {formatClock(elapsedSeconds(session.startTime, now))}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {done}/{session.segments.length} odcinków
              {totals.meters > 0 ? ` · ${formatDistance(totals.meters)}` : ''}
            </ThemedText>
          </View>
          <Pressable accessibilityLabel="Przerwij trening" onPress={confirmAbandon} hitSlop={8}>
            <Icon name="close" size={26} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {session.segments.map((segment, index) => (
            <SegmentRow
              key={segment.id}
              segment={segment}
              current={index === currentIndex}
              onToggle={() => toggle(segment)}
              onChange={(values) => {
                updateSegmentValues(db, segment.id, values);
                reload();
              }}
            />
          ))}

          <Button
            label="Zakończ trening"
            icon="check"
            onPress={() => router.push('/workout/finish')}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type SegmentRowProps = {
  segment: ActiveSegment;
  current: boolean;
  onToggle: () => void;
  onChange: (values: { distanceMeters?: number | null; durationSeconds?: number | null }) => void;
};

function SegmentRow({ segment, current, onToggle, onChange }: SegmentRowProps) {
  const theme = useTheme();
  const completed = segment.completedAt !== null;
  const pace = paceFrom(segment.distanceMeters, segment.durationSeconds);
  const target = [
    describeDuration(segment.durationType, segment.targetDistanceMeters, segment.targetDurationSeconds),
    describeTarget(segment.targetType, segment.targetLow, segment.targetHigh),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.card, current && { borderColor: theme.accent, borderWidth: 1 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardText}>
          <ThemedText type="smallBold">
            {SEGMENT_LABELS[segment.kind]}
            {segment.totalIterations > 1 ? ` ${segment.iteration}/${segment.totalIterations}` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {target}
          </ThemedText>
          {completed && (
            <ThemedText type="small" themeColor="textSecondary">
              {[
                segment.distanceMeters ? formatDistance(segment.distanceMeters) : null,
                segment.durationSeconds ? formatSeconds(segment.durationSeconds) : null,
                pace !== null ? formatPace(pace) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          )}
        </View>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={completed ? 'Cofnij odcinek' : 'Zapisz odcinek'}
          onPress={onToggle}
          hitSlop={8}>
          <Icon
            name={completed ? 'check_circle' : 'radio_button_unchecked'}
            size={30}
            color={completed ? theme.accent : theme.textSecondary}
          />
        </Pressable>
      </View>

      {(current || completed) && (
        <View style={styles.pair}>
          <NumberField
            label="Dystans (m)"
            value={segment.distanceMeters}
            decimal
            onChange={(distanceMeters) => onChange({ distanceMeters })}
          />
          <NumberField
            label="Czas (s)"
            value={segment.durationSeconds}
            onChange={(durationSeconds) => onChange({ durationSeconds })}
          />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.three },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  headerText: { flex: 1, gap: Spacing.half },
  clock: { fontVariant: ['tabular-nums'] },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cardText: { flex: 1, gap: Spacing.half },
  pair: { flexDirection: 'row', gap: Spacing.three },
});
