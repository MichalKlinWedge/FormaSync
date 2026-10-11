import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import type { ScheduledEntry } from '@/features/calendar/repository';
import { useScheduledRange } from '@/features/calendar/use-calendar';
import { isConnected } from '@/features/garmin/connect/client';
import {
  describeSend,
  inRange,
  nextWeek,
  pendingForGarmin,
  sendToGarmin,
  weekAround,
  type SendProgress,
} from '@/features/garmin/connect/send-range';
import { SPORT_LABELS } from '@/features/sports/sport';
import { addDays, formatDate, formatDayWithWeekday, todayKey } from '@/lib/date';

/**
 * Wysyłka treningów z wybranego okresu do kalendarza Garmina.
 *
 * Okres wybiera się przed wysyłką, a nie po: zwykle wysyła się tydzień, który dopiero nadchodzi,
 * a nie ten, który właśnie trwa. Lista pokazuje wprost, co pójdzie i czego nie — wysyłka hurtem
 * bez powiedzenia, co leci, byłaby decyzją podjętą za użytkownika.
 */
export default function GarminSendScreen() {
  const today = todayKey();
  const [range, setRange] = useState(() => nextWeek(today));
  const [busy, setBusy] = useState<SendProgress | null>(null);

  // Czytamy z zapasem, żeby przesuwanie granic nie wymagało nowego zapytania przy każdym dniu.
  const all = useScheduledRange(addDays(today, -1), addDays(range.to, 31));
  const entries = inRange(all, range);
  const pending = pendingForGarmin(entries, today);

  const run = async () => {
    if (!(await isConnected())) {
      Alert.alert(
        'Połącz konto Garmina',
        'Żeby wpisywać treningi do kalendarza Garmina, trzeba raz zalogować się na konto Garmina.',
        [
          { text: 'Nie teraz', style: 'cancel' },
          { text: 'Połącz', onPress: () => router.push('/settings/garmin') },
        ],
      );
      return;
    }

    setBusy({ done: 0, total: pending.length });
    try {
      const result = await sendToGarmin(db, entries, setBusy, today);
      Alert.alert('Kalendarz Garmina', describeSend(result));
    } finally {
      setBusy(null);
    }
  };

  // Granice nie mogą się minąć, a w przeszłość nie wysyłamy niczego.
  const shift = (edge: 'from' | 'to', days: number) =>
    setRange((current) => {
      const moved = addDays(current[edge], days);
      if (edge === 'to') return { from: current.from, to: moved < current.from ? current.from : moved };
      const notBeforeToday = moved < today ? today : moved;
      return { from: notBeforeToday > current.to ? current.to : notBeforeToday, to: current.to };
    });

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Idą treningi z dziś i z przyszłości, których jeszcze nie ma w kalendarzu Garmina.
            Odbyte i te, które już tam stoją, pomijamy.
          </ThemedText>
          <View style={styles.chips}>
            <Chip
              label="Ten tydzień"
              selected={range.from === weekAround(today).from && range.to === weekAround(today).to}
              onPress={() => setRange(weekAround(today))}
            />
            <Chip
              label="Następny tydzień"
              selected={range.from === nextWeek(today).from && range.to === nextWeek(today).to}
              onPress={() => setRange(nextWeek(today))}
            />
            <Chip
              label="Dwa tygodnie"
              selected={range.from === today && range.to === addDays(today, 13)}
              onPress={() => setRange({ from: today, to: addDays(today, 13) })}
            />
          </View>
        </View>

        <Edge
          label="OD"
          value={range.from}
          onShift={(days) => shift('from', days)}
          atLimit={range.from <= today}
        />
        <Edge label="DO" value={range.to} onShift={(days) => shift('to', days)} />

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {`DO WYSŁANIA: ${pending.length}`}
          </ThemedText>
          {entries.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              W tym okresie nie ma zaplanowanych treningów.
            </ThemedText>
          ) : (
            entries.map((entry) => <Row key={entry.id} entry={entry} today={today} />)
          )}
        </View>

        <Button
          label={`Wyślij do Garmina (${pending.length})`}
          icon="cloud_upload"
          onPress={() => void run()}
          disabled={busy !== null || pending.length === 0}
        />
        {busy !== null && (
          <View style={styles.busy}>
            <ActivityIndicator />
            <ThemedText type="small" themeColor="textSecondary">
              {`Wysyłam… ${busy.done} z ${busy.total}`}
            </ThemedText>
          </View>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          Trening, który już stoi u Garmina tego dnia, nie zostanie wpisany drugi raz — przed
          wpisaniem sprawdzamy jego kalendarz, a nie tylko to, co zapamiętał telefon.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

function Edge({
  label,
  value,
  onShift,
  atLimit,
}: {
  label: string;
  value: string;
  onShift: (days: number) => void;
  atLimit?: boolean;
}) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.dateRow}>
        <Button label="−1 dzień" variant="secondary" onPress={() => onShift(-1)} disabled={atLimit} />
        <Button label="+1 dzień" variant="secondary" onPress={() => onShift(1)} />
      </View>
      <ThemedText type="smallBold">{formatDayWithWeekday(value)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDate(value)}
      </ThemedText>
    </View>
  );
}

/** Wiersz listy: co pójdzie, a co nie i dlaczego. */
function Row({ entry, today }: { entry: ScheduledEntry; today: string }) {
  const skipped =
    entry.isCompleted
      ? 'zrobiony'
      : entry.garminScheduleId !== null
        ? 'już u Garmina'
        : entry.scheduledDate < today
          ? 'przeszłość'
          : null;

  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowDate}>
        {formatDate(entry.scheduledDate).split(' ').slice(0, 2).join(' ')}
      </ThemedText>
      <View style={styles.rowText}>
        <ThemedText type="small" themeColor={skipped === null ? 'text' : 'textSecondary'}>
          {entry.planTitle}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[SPORT_LABELS[entry.sport], entry.scheduledTime, skipped].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  dateRow: { flexDirection: 'row', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  rowDate: { width: 78 },
  rowText: { flex: 1, gap: Spacing.half },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
