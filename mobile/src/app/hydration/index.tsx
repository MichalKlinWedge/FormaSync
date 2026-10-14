import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { describeDay } from '@/features/hydration/day';
import { DayBar } from '@/features/hydration/day-bar';
import { formatMl, portionTime } from '@/features/hydration/format';
import { PortionButtons } from '@/features/hydration/portion-buttons';
import { syncHydrationReminders } from '@/features/hydration/reminders';
import { addExtra, logDrink, removeDrink } from '@/features/hydration/repository';
import { describeTarget } from '@/features/hydration/target';
import { useHydrationDay, useHydrationHistory } from '@/features/hydration/use-hydration';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, todayKey } from '@/lib/date';
import { pluralWith } from '@/lib/number';

const MINUTE_MS = 60_000;

/** Korekta na dziś — upał, sauna. Tylko w górę: nikt nie potrzebuje pić mniej. */
const EXTRA_STEPS = [250, 500];

export default function HydrationScreen() {
  const theme = useTheme();
  const today = todayKey();
  const { consumed, target, portions, settings } = useHydrationDay(today);
  const { days, streak } = useHydrationHistory(today);
  // Ten ekran przeliczał kreskę tylko wtedy, gdy zmieniły się dane, więc po dłuższym postoju
  // stał zatrzymany na godzinie wejścia i pokazywał inną kreskę niż kafelek na „Dziś”.
  const at = new Date(useNow(MINUTE_MS));

  const replan = () => void syncHydrationReminders().catch(() => {});
  const maxDay = Math.max(...days.map((day) => Math.max(day.milliliters, day.target)), 1);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          <View style={styles.header}>
            <ThemedText type="title">{formatMl(consumed)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {target.planned > 0
                ? `z ${formatMl(target.total)} · cel dnia ${formatMl(target.dayTotal)}`
                : `z ${formatMl(target.total)}`}
            </ThemedText>
          </View>
          <DayBar
            consumedMl={consumed}
            targetMl={target.total}
            plannedMl={target.planned}
            window={settings.window}
            at={at}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {describeDay(consumed, target.total, settings.window, at)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Cel: {describeTarget(target)}
          </ThemedText>
        </View>

        <View style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            DOPISZ
          </ThemedText>
          <PortionButtons
            portions={settings.portions}
            onDrink={(milliliters) => {
              logDrink(db, milliliters);
              replan();
            }}
          />
        </View>

        <View style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            KOREKTA NA DZIŚ
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Upał, sauna, długi lot — podnosi sam cel, nie wypite. Dziś dołożone: {formatMl(target.extra)}.
          </ThemedText>
          <View style={styles.chips}>
            {EXTRA_STEPS.map((milliliters) => (
              <Chip
                key={milliliters}
                label={`+${formatMl(milliliters)}`}
                selected={false}
                onPress={() => {
                  addExtra(db, today, milliliters);
                  replan();
                }}
              />
            ))}
            {target.extra > 0 && (
              <Chip
                label="Wyczyść"
                selected={false}
                onPress={() => {
                  addExtra(db, today, -target.extra);
                  replan();
                }}
              />
            )}
          </View>
        </View>

        <View style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            DZISIEJSZE PORCJE
          </ThemedText>
          {portions.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Dziś jeszcze nic nie zapisane.
            </ThemedText>
          ) : (
            portions.map((portion) => (
              <View key={portion.id} style={styles.portionRow}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.portionTime}>
                  {portionTime(portion.loggedAt)}
                </ThemedText>
                <ThemedText type="small" style={styles.portionValue}>
                  {formatMl(portion.milliliters)}
                  {portion.source === 'GARMIN' ? ' · z Garmina' : ''}
                </ThemedText>
                <Pressable
                  accessibilityLabel={`Usuń porcję z ${portionTime(portion.loggedAt)}`}
                  hitSlop={8}
                  onPress={() => {
                    removeDrink(db, portion.id);
                    replan();
                  }}>
                  <Icon name="close" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            OSTATNIE DNI
          </ThemedText>
          {days.map((day) => (
            <View key={day.dayKey} style={styles.barRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.barLabel}>
                {formatDate(day.dayKey).slice(0, 5)}
              </ThemedText>
              <View style={[styles.barTrack, { backgroundColor: theme.backgroundElement }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: day.met ? theme.chart1 : theme.accent,
                      width: `${(day.milliliters / maxDay) * 100}%`,
                    },
                  ]}
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.barValue}>
                {day.milliliters > 0 ? formatMl(day.milliliters) : '—'}
              </ThemedText>
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            {streak === 0
              ? 'Cel dnia jeszcze nie dowieziony dzień po dniu.'
              : `Cel dowieziony ${pluralWith(streak, 'dzień', 'dni', 'dni')} z rzędu.`}
          </ThemedText>
        </View>

        <Button
          label="Pilnowanie i porcje"
          icon="settings"
          variant="secondary"
          onPress={() => router.push('/hydration/settings')}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  group: { gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  cell: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  portionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  portionTime: { width: 48 },
  portionValue: { flex: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  barLabel: { width: 44 },
  barTrack: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 7 },
  barValue: { width: 64, textAlign: 'right' },
});
