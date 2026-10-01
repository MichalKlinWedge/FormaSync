import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatDateTime } from '@/lib/date';
import { pluralWith } from '@/lib/number';

import {
  getAvailability,
  grantedCount,
  HealthPermissionsError,
  HealthUnavailableError,
  HISTORY_DAYS,
  lastSyncAt,
  openSettings,
  requestHealthPermissions,
  syncHealth,
} from './sync';

/** Sekcja Ustawień obsługująca połączenie z Health Connect i ręczną synchronizację. */
export function HealthSection() {
  const [busy, setBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(() => lastSyncAt());

  const connect = async () => {
    setBusy(true);
    try {
      const availability = await getAvailability();
      if (availability !== 'AVAILABLE') {
        Alert.alert(
          'Health Connect niedostępny',
          availability === 'NEEDS_UPDATE'
            ? 'Zaktualizuj Health Connect w sklepie Play i spróbuj ponownie.'
            : 'Twoje urządzenie nie udostępnia Health Connect. Dane biometryczne nie będą pobierane.',
        );
        return;
      }
      const granted = await requestHealthPermissions();
      if (granted === 0) {
        Alert.alert(
          'Brak zgody',
          'Bez dostępu do danych zdrowotnych nie pokażemy tętna ani snu przy treningach. Zgody możesz nadać w ustawieniach Health Connect.',
        );
        return;
      }
      Alert.alert('Połączono', `Przyznano ${pluralWith(granted, 'zgodę', 'zgody', 'zgód')}.`);
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const result = await syncHealth();
      setSyncedAt(lastSyncAt());
      Alert.alert(
        'Zsynchronizowano',
        result.sessions === 0 && result.days === 0
          ? `Health Connect nie zwrócił danych z ostatnich ${HISTORY_DAYS} dni. Sprawdź, czy Garmin Connect ma włączony zapis do Health Connect.`
          : `Treningi z danymi: ${result.sessions}. Dni z pomiarami: ${result.days}.`,
      );
    } catch (e) {
      if (e instanceof HealthPermissionsError) {
        Alert.alert('Brak zgody', 'Najpierw połącz aplikację z Health Connect.');
      } else if (e instanceof HealthUnavailableError) {
        Alert.alert('Health Connect niedostępny', e.message);
      } else {
        Alert.alert('Nie udało się pobrać', e instanceof Error ? e.message : 'Nieznany błąd.');
      }
    } finally {
      setBusy(false);
    }
  };

  const checkPermissions = async () => {
    const count = await grantedCount();
    Alert.alert(
      'Stan połączenia',
      count === 0
        ? 'Brak przyznanych zgód na odczyt danych zdrowotnych.'
        : `Przyznano ${pluralWith(count, 'zgodę', 'zgody', 'zgód')} na odczyt danych.`,
    );
  };

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        DANE ZDROWOTNE
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Tętno, sen i ciśnienie z zegarka Garmin trafiają do systemowego Health Connect, skąd FormaSync może
        je odczytać. Włącz zapis do Health Connect w aplikacji Garmin Connect, a potem połącz aplikacje tutaj.
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Tą drogą nie przychodzą metryki własne Garmina: Body Battery, poziom stresu ani gotowość treningowa.
      </ThemedText>

      <Button label="Połącz z Health Connect" icon="link" onPress={() => void connect()} disabled={busy} />
      <Button
        label="Pobierz dane"
        icon="sync"
        variant="secondary"
        onPress={() => void sync()}
        disabled={busy}
      />
      <Button
        label="Sprawdź zgody"
        icon="check"
        variant="secondary"
        onPress={() => void checkPermissions()}
        disabled={busy}
      />
      <Button
        label="Otwórz ustawienia Health Connect"
        icon="settings"
        variant="secondary"
        onPress={openSettings}
        disabled={busy}
      />

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

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
