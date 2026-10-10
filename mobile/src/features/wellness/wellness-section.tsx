import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { GarminAuthExpired, GarminNotConnectedError } from '@/features/garmin/connect/client';
import { formatDateTime } from '@/lib/date';

import { describeCounts } from './report';
import { lastSyncAt, syncWellness, WELLNESS_DAYS } from './sync';

/** Sekcja Ustawień z ręcznym pobraniem danych zdrowotnych z Garmin Connect. */
export function WellnessSection() {
  const [busy, setBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(() => lastSyncAt());

  const sync = async () => {
    setBusy(true);
    try {
      const result = await syncWellness();
      setSyncedAt(lastSyncAt());
      Alert.alert(
        'Pobrano',
        result.sessions === 0 && result.days === 0
          ? `Garmin Connect nie zwrócił danych z ostatnich ${WELLNESS_DAYS} dni. Sprawdź, czy zegarek zsynchronizował się z telefonem.`
          : `${describeCounts(result.counts, WELLNESS_DAYS)}\n\nTreningi z tętnem: ${result.sessions}.`,
      );
    } catch (e) {
      Alert.alert('Nie udało się pobrać', describe(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        DANE ZDROWOTNE
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Tętno spoczynkowe, sen, HRV, ciśnienie i kalorie czytamy wprost z Garmin Connect — tym samym
        połączeniem, którym wysyłamy plany na zegarek. Odświeżamy ostatnie {WELLNESS_DAYS} dni.
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Tą drogą nie przychodzą metryki własne Garmina: Body Battery, poziom stresu ani gotowość
        treningowa.
      </ThemedText>

      <Button label="Pobierz dane" icon="sync" onPress={() => void sync()} disabled={busy} />

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Pracuję…
          </ThemedText>
        </View>
      )}
      {syncedAt && (
        <ThemedText type="small" themeColor="textSecondary">
          Ostatnie pobranie: {formatDateTime(syncedAt)}
        </ThemedText>
      )}
    </View>
  );
}

function describe(error: unknown): string {
  if (error instanceof GarminNotConnectedError || error instanceof GarminAuthExpired) {
    return 'Najpierw połącz konto Garmin Connect — przycisk znajdziesz wyżej, w sekcji Garmin.';
  }
  return error instanceof Error ? error.message : 'Nieznany błąd.';
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
