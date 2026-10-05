import { router, Stack } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { RPE_VALUES } from '@/components/rpe-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { SessionHealth } from '@/features/health/session-health';
import { deleteSession, loadSessionMeta, updateSessionMeta } from '@/features/history/repository';
import { formatClock } from '@/features/workout/logic';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/date';

import { SEGMENT_LABELS } from './draft';
import { describeTarget, formatDistance, formatPace, formatSeconds, paceFrom } from './format';
import { loadEnduranceSession, paceBreakdown, sessionTotals } from './session';

type Props = { id: number; footer?: ReactNode };

/** Szczegóły przeprowadzonego treningu wytrzymałościowego: odcinki, dystans, tempo. */
export function EnduranceSessionDetails({ id, footer }: Props) {
  const theme = useTheme();
  const [session] = useState(() => loadEnduranceSession(db, id));
  const [meta] = useState(() => loadSessionMeta(db, id));
  const [notes, setNotes] = useState(meta?.userNotes ?? '');
  const [rpe, setRpe] = useState<number | null>(meta?.rpeRating ?? null);

  if (!session || !meta) return <ThemedView style={styles.flex} />;

  const totals = sessionTotals(session.segments);
  const pace = paceBreakdown(session.segments);
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

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <Stack.Screen options={{ title: session.title ?? 'Trening' }} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.titleBlock}>
            <ThemedText type="subtitle">{session.title ?? 'Trening'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDateTime(session.startTime)}
            </ThemedText>
          </View>

          <View style={styles.stats}>
            <Stat
              label="Czas"
              value={meta.totalDurationSeconds === null ? '—' : formatClock(meta.totalDurationSeconds)}
            />
            <Stat label="Dystans" value={totals.meters > 0 ? formatDistance(totals.meters) : '—'} />
          </View>
          <View style={styles.stats}>
            <Stat label="Tempo całości" value={pace.overall === null ? '—' : formatPace(pace.overall)} />
            <Stat label="Tempo pracy" value={pace.work === null ? '—' : formatPace(pace.work)} />
          </View>

          <View style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ODCINKI
            </ThemedText>
            {session.segments.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  Ten trening nie ma zapisanych odcinków.
                </ThemedText>
              </ThemedView>
            ) : (
              session.segments.map((segment) => {
                const segmentPace = paceFrom(segment.distanceMeters, segment.durationSeconds);
                return (
                  <ThemedView key={segment.id} type="backgroundElement" style={styles.card}>
                    <ThemedText type="smallBold">
                      {SEGMENT_LABELS[segment.kind]}
                      {segment.totalIterations > 1
                        ? ` ${segment.iteration}/${segment.totalIterations}`
                        : ''}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[
                        segment.distanceMeters ? formatDistance(segment.distanceMeters) : null,
                        segment.durationSeconds ? formatSeconds(segment.durationSeconds) : null,
                        segmentPace !== null ? formatPace(segmentPace) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </ThemedText>
                    {describeTarget(segment.targetType, segment.targetLow, segment.targetHigh) !==
                      null && (
                      <ThemedText type="small" themeColor="textSecondary">
                        cel: {describeTarget(segment.targetType, segment.targetLow, segment.targetHigh)}
                      </ThemedText>
                    )}
                  </ThemedView>
                );
              })
            )}
          </View>

          <SessionHealth sessionId={id} startTime={session.startTime} />

          <View style={styles.group}>
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

          <View style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              UWAGI PO TRENINGU
            </ThemedText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              onBlur={() => saveMeta({ userNotes: notes.trim() || null })}
              multiline
              placeholder="Jak się biegło…"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
          </View>

          {footer}
          <Button label="Usuń trening" icon="delete" variant="danger" onPress={confirmDelete} />
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
  titleBlock: { gap: Spacing.half },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: 12, padding: Spacing.three, gap: Spacing.half },
  group: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.half },
  input: { borderRadius: 12, padding: Spacing.three, minHeight: 90, textAlignVertical: 'top', fontSize: 16 },
});
