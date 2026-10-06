import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { clearGarminSchedule, setGarminSchedule } from '@/features/calendar/repository';
import { formatDate } from '@/lib/date';

import { GarminAuthExpired, GarminError, isConnected } from './client';
import { EmptyPlanError } from './payload';
import { scheduleOnGarmin, sendPlan, unscheduleOnGarmin } from './workouts';

type Props = {
  scheduledId: number;
  planId: number;
  scheduledDate: string;
  /** Identyfikator wpisu w kalendarzu Garmina, jeśli termin już tam stoi. */
  garminScheduleId: string | null;
  onChanged: () => void;
};

/**
 * Wpisanie terminu do kalendarza Garmina. Najpierw trening musi być w bibliotece — wysyłamy go
 * przy okazji, bo kalendarz Garmina wskazuje na trening, a nie zawiera go w sobie.
 */
export function GarminScheduleButton({
  scheduledId,
  planId,
  scheduledDate,
  garminScheduleId,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);

  const askToConnect = () =>
    Alert.alert(
      'Połącz konto Garmina',
      'Żeby wpisać termin do kalendarza Garmina, trzeba raz zalogować się na konto Garmina.',
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
      // Kalendarz Garmina wskazuje na trening z biblioteki, więc najpierw upewniamy się,
      // że ten trening tam jest i jest aktualny.
      const sent = await sendPlan(db, planId);
      const scheduleId = await scheduleOnGarmin(sent.workoutId, scheduledDate);
      setGarminSchedule(db, scheduledId, { workoutId: sent.workoutId, scheduleId });
      onChanged();
      Alert.alert(
        'Wpisano do kalendarza Garmina',
        `Trening stoi na ${formatDate(scheduledDate)}. Zegarek pobierze go przy najbliższej synchronizacji.`,
      );
    } catch (error) {
      Alert.alert('Nie udało się wpisać', describe(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (garminScheduleId === null) return;
    setBusy(true);
    try {
      await unscheduleOnGarmin(Number(garminScheduleId));
      clearGarminSchedule(db, scheduledId);
      onChanged();
    } catch (error) {
      Alert.alert('Nie udało się zdjąć', describe(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {garminScheduleId === null ? (
        <Button
          label="Wpisz do kalendarza Garmina"
          icon="cloud_upload"
          variant="secondary"
          onPress={() => void send()}
          disabled={busy}
        />
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Termin stoi w kalendarzu Garmina.
          </ThemedText>
          <Button
            label="Zdejmij z kalendarza Garmina"
            icon="link_off"
            variant="secondary"
            onPress={() => void remove()}
            disabled={busy}
          />
        </>
      )}
      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Rozmawiam z Garminem…
          </ThemedText>
        </View>
      )}
    </View>
  );
}

function describe(error: unknown): string {
  if (error instanceof EmptyPlanError) return error.message;
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
