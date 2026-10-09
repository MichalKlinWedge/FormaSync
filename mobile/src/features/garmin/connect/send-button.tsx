import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import type { Sport } from '@/db/schema';
import { goesToGarmin } from '@/features/sports/sport';
import { pluralWith } from '@/lib/number';

import { GarminAuthExpired, GarminError, isConnected } from './client';
import { EmptyPlanError, SportNotOnWatchError } from './payload';
import { sendPlan } from './workouts';

/**
 * Wysyłka planu do biblioteki Garmin Connect. Stan połączenia sprawdzamy dopiero przy
 * naciśnięciu — ekran planu nie ma po co odpytywać SecureStore przy każdym otwarciu.
 */
export function SendToGarminButton({ planId, sport }: { planId: number; sport: Sport }) {
  const [busy, setBusy] = useState(false);

  const askToConnect = () =>
    Alert.alert(
      'Połącz konto Garmina',
      'Żeby wysłać plan do biblioteki Garmin Connect, trzeba raz zalogować się na konto Garmina.',
      [
        { text: 'Nie teraz', style: 'cancel' },
        { text: 'Połącz', onPress: () => router.push('/settings/garmin') },
      ],
    );

  const send = async () => {
    if (!(await isConnected())) {
      askToConnect();
      return;
    }
    setBusy(true);
    try {
      const result = await sendPlan(db, planId);
      Alert.alert(
        result.overwritten ? 'Nadpisano w Garmin Connect' : 'Wysłano do Garmin Connect',
        [
          result.overwritten
            ? 'Trening o tej nazwie już tam był — zaktualizowaliśmy go w miejscu, więc wpisy w kalendarzu Garmina zostają ważne.'
            : 'Trening jest w bibliotece. Zegarek pobierze go przy najbliższej synchronizacji z Garmin Connect.',
          result.duplicates.length > 0
            ? `W bibliotece ${pluralWith(result.duplicates.length, 'została', 'zostały', 'zostało')} jeszcze ${pluralWith(result.duplicates.length, 'kopia', 'kopie', 'kopii')} o tej nazwie — usuniesz je w Garmin Connect.`
            : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
    } catch (error) {
      Alert.alert('Nie udało się wysłać', describe(error));
    } finally {
      setBusy(false);
    }
  };

  // Zamiast wyszarzonego przycisku mówimy wprost, dlaczego go nie ma — inaczej wygląda to
  // na usterkę akurat przy tym planie.
  if (!goesToGarmin(sport)) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Garmin nie ma kategorii na „Różne”, więc ten plan zostaje w telefonie — w kalendarzu
        aplikacji, historii i statystykach.
      </ThemedText>
    );
  }

  return (
    <View style={styles.wrap}>
      <Button
        label="Wyślij do Garmin Connect"
        icon="cloud_upload"
        variant="secondary"
        onPress={() => void send()}
        disabled={busy}
      />
      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Wysyłam do Garmina…
          </ThemedText>
        </View>
      )}
    </View>
  );
}

function describe(error: unknown): string {
  if (error instanceof EmptyPlanError || error instanceof SportNotOnWatchError) return error.message;
  if (error instanceof GarminAuthExpired) {
    return 'Połączenie z Garmin Connect wygasło. Zaloguj się ponownie w Ustawieniach.';
  }
  if (error instanceof GarminError) return error.message;
  return 'Nie udało się połączyć z Garminem. Sprawdź internet i spróbuj ponownie.';
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
