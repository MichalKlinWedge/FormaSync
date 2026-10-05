import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pluralWith } from '@/lib/number';

import type { Sport } from '@/db/schema';

import { SEGMENT_LABELS } from './draft';
import { describeDuration, describeTarget, formatDistance } from './format';
import { usePoolLength } from './pool-store';
import { describeSwimDistance, STROKE_LABELS } from './swim';
import type { SegmentRow } from './use-endurance-plan';

/**
 * Odcinki planu w kolejności biegu, z wciętą zawartością grup powtórzeń. Ten sam widok służy
 * podglądowi planu i terminowi w kalendarzu — plan wytrzymałościowy nie ma ćwiczeń, więc bez
 * tego termin na bieg wyglądałby na pusty.
 */
export function PlanSegmentList({ rows, sport }: { rows: SegmentRow[]; sport?: Sport }) {
  const theme = useTheme();
  const poolLength = usePoolLength();

  if (rows.length === 0) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          Ten plan nie ma jeszcze żadnego odcinka.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <View style={styles.items}>
      {rows.map((row) => (
        <ThemedView
          key={row.id}
          type="backgroundElement"
          style={[styles.item, row.nested && { marginLeft: Spacing.four }]}>
          <View style={[styles.marker, { backgroundColor: theme.accent }]} />
          <View style={styles.itemText}>
            <ThemedText type="smallBold">
              {row.kind === 'REPEAT'
                ? pluralWith(row.repeatCount ?? 1, 'powtórzenie', 'powtórzenia', 'powtórzeń')
                : SEGMENT_LABELS[row.kind]}
            </ThemedText>
            {row.kind !== 'REPEAT' && (
              <ThemedText type="small" themeColor="textSecondary">
                {[
                  // Na basenie dystans czyta się w długościach — „8× ” mówi więcej niż „200 m”.
                  sport === 'SWIMMING' && row.durationType === 'DISTANCE'
                    ? describeSwimDistance(row.distanceMeters, poolLength, formatDistance)
                    : describeDuration(row.durationType, row.distanceMeters, row.durationSeconds),
                  row.stroke === null || row.stroke === 'ANY' ? null : STROKE_LABELS[row.stroke],
                  describeTarget(row.targetType, row.targetLow, row.targetHigh),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            )}
          </View>
        </ThemedView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  items: { gap: Spacing.two },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 12,
    padding: Spacing.three,
  },
  marker: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  itemText: { flex: 1, gap: Spacing.half },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
});
