import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/date';

import { dayRatio, describeDay } from './day';
import { formatMl } from './format';
import { syncHydrationReminders } from './reminders';
import { logDrink, undoLastDrink } from './repository';
import { useHydrationDay } from './use-hydration';

/**
 * Kafelek nawodnienia na „Dziś”. Stoi poza przełącznikiem sportu, bo picie nie jest cechą
 * dyscypliny — pije się każdego dnia, także takiego bez treningu.
 */
export function HydrationCard() {
  const theme = useTheme();
  const today = todayKey();
  const { consumed, target, portions, settings } = useHydrationDay(today);

  // Po każdej zmianie planujemy przypomnienia od nowa: wypita szklanka zdejmuje najbliższe.
  const drink = (milliliters: number) => {
    logDrink(db, milliliters);
    void syncHydrationReminders().catch(() => {});
  };

  const undo = () => {
    undoLastDrink(db, today);
    void syncHydrationReminders().catch(() => {});
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            NAWODNIENIE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {describeDay(consumed, target.total, settings.window, new Date())}
          </ThemedText>
        </View>
        <ThemedText type="smallBold">
          {formatMl(consumed)} / {formatMl(target.total)}
        </ThemedText>
      </View>

      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: consumed >= target.total ? theme.chart1 : theme.accent,
              width: `${dayRatio(consumed, target.total) * 100}%`,
            },
          ]}
        />
      </View>

      <View style={styles.row}>
        {settings.portions.map((milliliters) => (
          <View key={milliliters} style={styles.portion}>
            <Button label={`+${formatMl(milliliters)}`} icon="water_drop" onPress={() => drink(milliliters)} />
          </View>
        ))}
      </View>

      <View style={styles.row}>
        <View style={styles.portion}>
          <Button
            label="Cofnij"
            icon="undo"
            variant="secondary"
            onPress={undo}
            disabled={portions.length === 0}
          />
        </View>
        <View style={styles.portion}>
          <Button
            label="Szczegóły"
            icon="chevron_right"
            variant="secondary"
            onPress={() => router.push('/hydration')}
          />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  headerText: { flex: 1, gap: Spacing.half },
  track: { height: 12, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  row: { flexDirection: 'row', gap: Spacing.two },
  portion: { flex: 1 },
});
