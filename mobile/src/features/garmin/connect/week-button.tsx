import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import type { ScheduledEntry } from '@/features/calendar/repository';
import { formatDate } from '@/lib/date';
import { pluralWith } from '@/lib/number';

import { isConnected } from './client';
import {
  describeWeekSend,
  pendingForGarmin,
  sendWeekToGarmin,
  type SendProgress,
} from './send-week';

type Props = {
  /** Terminy tygodnia — już zawężone tak, jak widzi je użytkownik. */
  entries: ScheduledEntry[];
  weekStart: string;
};

/**
 * Wysyłka całego tygodnia do kalendarza Garmina. Liczba na przycisku jest tu istotna: hurtowa
 * wysyłka bez powiedzenia wprost, ile i czego pójdzie, byłaby decyzją podjętą za użytkownika.
 */
export function GarminWeekButton({ entries, weekStart }: Props) {
  const [busy, setBusy] = useState<SendProgress | null>(null);
  const pending = pendingForGarmin(entries);

  if (pending.length === 0) return null;

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
      const result = await sendWeekToGarmin(db, entries, setBusy);
      Alert.alert('Tydzień u Garmina', describeWeekSend(result));
    } finally {
      setBusy(null);
    }
  };

  const ask = () =>
    Alert.alert(
      'Wysłać tydzień do Garmina?',
      `Od ${formatDate(weekStart)} pójdzie ${pluralWith(pending.length, 'trening', 'treningi', 'treningów')}:\n${pending
        .map((entry) => `${formatDate(entry.scheduledDate)} — ${entry.planTitle}`)
        .join('\n')}`,
      [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Wyślij', onPress: () => void run() },
      ],
    );

  return (
    <View style={styles.wrap}>
      <Button
        label={`Wyślij tydzień do Garmina (${pending.length})`}
        icon="cloud_upload"
        variant="secondary"
        onPress={ask}
        disabled={busy !== null}
      />
      {busy !== null && (
        <View style={styles.busy}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            {`Wysyłam… ${busy.done} z ${busy.total}`}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
