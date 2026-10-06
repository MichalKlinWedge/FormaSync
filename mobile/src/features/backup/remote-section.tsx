import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatDateTime } from '@/lib/date';

import { getAddress, getLastBackupAt } from './remote-config';

/**
 * Stan skrytki na kopie w Ustawieniach. Samo ustawianie żyje na osobnym ekranie, bo prosi
 * o hasło — pole na hasło nie ma czego szukać pośrodku listy ustawień.
 */
export function RemoteBackupSection() {
  const [state, setState] = useState<{ address: string | null; lastAt: string | null }>({
    address: null,
    lastAt: null,
  });

  // Po powrocie z ekranu skrytki stan musi się odświeżyć bez przeładowania Ustawień.
  useFocusEffect(
    useCallback(() => {
      setState({ address: getAddress(), lastAt: getLastBackupAt() });
    }, []),
  );

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        KOPIA NA SERWERZE
      </ThemedText>
      {state.address === null ? (
        <ThemedText type="small" themeColor="textSecondary">
          Codzienna kopia całej bazy na Twoim serwerze, zaszyfrowana hasłem, którego serwer nie zna.
          Telefon da się zgubić — kopia wyłącznie w nim nie jest żadną kopią.
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {state.lastAt === null
            ? 'Skrytka podłączona, ale żadna kopia jeszcze nie poleciała.'
            : `Ostatnia kopia: ${formatDateTime(state.lastAt)}.`}
        </ThemedText>
      )}
      <Button
        label={state.address === null ? 'Ustaw kopię na serwerze' : 'Kopia na serwerze'}
        icon="cloud_upload"
        variant="secondary"
        onPress={() => router.push('/settings/remote-backup')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
});
