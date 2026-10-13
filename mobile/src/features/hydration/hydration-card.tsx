import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { useNow } from '@/hooks/use-now';
import { todayKey } from '@/lib/date';

import { describeDay } from './day';
import { DayBar } from './day-bar';
import { formatMl } from './format';
import { PortionButtons } from './portion-buttons';
import { syncHydrationReminders } from './reminders';
import { logDrink, undoLastDrink } from './repository';
import { useHydrationDay } from './use-hydration';

const MINUTE_MS = 60_000;

/**
 * Kafelek nawodnienia na „Dziś”. Stoi poza przełącznikiem sportu, bo picie nie jest cechą
 * dyscypliny — pije się każdego dnia, także takiego bez treningu.
 */
export function HydrationCard() {
  const today = todayKey();
  const { consumed, target, portions, settings } = useHydrationDay(today);
  // Jedna chwila na kreskę i na zdanie pod nią — inaczej mogły trafić na różne strony tego
  // samego tyknięcia i pokazać dwie różne rzeczy. Co minutę, bo kreska przesuwa się o włos.
  const at = new Date(useNow(MINUTE_MS));

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
            {describeDay(consumed, target.total, settings.window, at)}
          </ThemedText>
        </View>
        <ThemedText type="smallBold">
          {formatMl(consumed)} / {formatMl(target.total)}
        </ThemedText>
      </View>

      <DayBar
        consumedMl={consumed}
        targetMl={target.total}
        window={settings.window}
        at={at}
        height={12}
      />

      <PortionButtons portions={settings.portions} onDrink={drink} />

      <View style={styles.row}>
        <View style={styles.cell}>
          <Button
            label="Cofnij"
            icon="undo"
            variant="secondary"
            onPress={undo}
            disabled={portions.length === 0}
          />
        </View>
        <View style={styles.cell}>
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
  row: { flexDirection: 'row', gap: Spacing.two },
  cell: { flex: 1 },
});
