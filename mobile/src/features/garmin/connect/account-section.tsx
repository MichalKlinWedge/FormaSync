import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import { clearTokens, isConnected } from './client';

/**
 * Stan konta Garmin Connect w Ustawieniach. Samo logowanie żyje na osobnym ekranie, bo prosi
 * o hasło — nie chcemy pola na hasło pośrodku listy ustawień.
 */
export function GarminAccountSection() {
  const [connected, setConnected] = useState<boolean | null>(null);

  // Po powrocie z ekranu logowania stan musi się odświeżyć bez przeładowania Ustawień.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void isConnected().then((value) => {
        if (!cancelled) setConnected(value);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const confirmDisconnect = () =>
    Alert.alert(
      'Rozłączyć konto Garmina?',
      'Z telefonu znikną tokeny dostępu. Plany i historia zostają — zniknie tylko możliwość wysyłania treningów bez ponownego logowania.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Rozłącz',
          style: 'destructive',
          onPress: () => {
            void clearTokens().then(() => setConnected(false));
          },
        },
      ],
    );

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        GARMIN CONNECT
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {connected
          ? 'Konto połączone. Plan wyślesz do biblioteki Garmina przyciskiem na ekranie planu.'
          : 'Po połączeniu konta wyślesz plan treningowy wprost do biblioteki Garmin Connect, bez komputera i bez kabla.'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Garmin nie udostępnia publicznego API do zapisu treningów — aplikacja loguje się tą samą
        drogą, co aplikacja mobilna Garmina. Hasła nie zapisujemy; na telefonie zostają wyłącznie
        tokeny dostępu. Garmin może zmienić tę drogę bez zapowiedzi i wtedy wysyłka przestanie działać.
      </ThemedText>

      {connected ? (
        <Button label="Rozłącz konto" icon="logout" variant="secondary" onPress={confirmDisconnect} />
      ) : (
        <Button
          label="Połącz konto Garmina"
          icon="link"
          variant="secondary"
          onPress={() => router.push('/settings/garmin')}
          disabled={connected === null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
});
