import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { backupStats, restoreBackup } from '@/features/backup/backup';
import { downloadBackup, listBackups, sendBackupNow } from '@/features/backup/remote-backup';
import { checkAddress, listRemoteBackups, type RemoteBackup } from '@/features/backup/remote';
import {
  forgetRemote,
  getAddress,
  getLastBackupAt,
  setAddress,
  setPassword,
  setToken,
} from '@/features/backup/remote-config';
import { syncWorkoutReminders } from '@/features/calendar/reminders';
import { findActiveSessionId } from '@/features/workout/repository';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/date';
import { formatNumber } from '@/lib/number';

/**
 * Skrytka na kopie zapasowe: adres własnego serwera, token i hasło, którym zamykamy kopię.
 * Hasło prosi o osobny ekran z tego samego powodu co logowanie do Garmina — pole na hasło nie
 * ma czego szukać pośrodku listy ustawień.
 */
export default function RemoteBackupScreen() {
  const theme = useTheme();
  const [address, setAddressText] = useState(() => getAddress() ?? '');
  const [token, setTokenText] = useState('');
  const [password, setPasswordText] = useState('');
  const [repeated, setRepeated] = useState('');
  const [configured, setConfigured] = useState(() => getAddress() !== null);
  const [lastAt, setLastAt] = useState(() => getLastBackupAt());
  const [busy, setBusy] = useState<null | string>(null);
  const [copies, setCopies] = useState<RemoteBackup[] | null>(null);
  const [restorePassword, setRestorePassword] = useState('');

  const field = [
    styles.input,
    { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
  ];

  const fail = (title: string, error: unknown) =>
    Alert.alert(title, error instanceof Error ? error.message : 'Nieznany błąd.');

  const connect = async () => {
    if (password !== repeated) {
      Alert.alert('Hasła się różnią', 'Wpisz to samo hasło dwa razy — przy literówce kopie byłyby nie do odczytania.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Za krótkie hasło', 'Hasło chroni wszystkie kopie na serwerze. Daj mu przynajmniej 8 znaków.');
      return;
    }
    setBusy('Sprawdzam połączenie…');
    try {
      const checked = checkAddress(address);
      // Sprawdzamy adres i token od razu: błędny wpis wyszedłby inaczej dopiero przy
      // pierwszej nocnej kopii, czyli wtedy, gdy nikt nie patrzy.
      await listRemoteBackups({ address: checked, token: token.trim() });
      setAddress(checked);
      await setToken(token.trim());
      await setPassword(password);
      setConfigured(true);
      setTokenText('');
      setPasswordText('');
      setRepeated('');
      Alert.alert(
        'Skrytka podłączona',
        'Kopia poleci teraz i potem raz na dobę przy uruchomieniu aplikacji. Zapisz hasło poza telefonem — bez niego kopie są nie do odczytania.',
      );
    } catch (error) {
      fail('Nie udało się podłączyć', error);
    } finally {
      setBusy(null);
    }
  };

  const sendNow = async () => {
    setBusy('Szyfruję i wysyłam…');
    try {
      const result = await sendBackupNow();
      setLastAt(getLastBackupAt());
      setCopies(null);
      Alert.alert('Kopia wysłana', `Zapisano ${formatNumber(result.size)} bajtów na serwerze.`);
    } catch (error) {
      fail('Nie udało się wysłać', error);
    } finally {
      setBusy(null);
    }
  };

  const loadCopies = async () => {
    setBusy('Czytam spis kopii…');
    try {
      setCopies(await listBackups());
    } catch (error) {
      fail('Nie udało się odczytać spisu', error);
    } finally {
      setBusy(null);
    }
  };

  const restore = useCallback(
    async (copy: RemoteBackup) => {
      if (findActiveSessionId(db) !== null) {
        Alert.alert('Trwa trening', 'Najpierw zakończ lub przerwij bieżący trening.');
        return;
      }
      if (restorePassword === '') {
        Alert.alert('Podaj hasło', 'Kopie są zaszyfrowane — bez hasła nie da się ich otworzyć.');
        return;
      }
      setBusy('Pobieram i odszyfrowuję…');
      let backup;
      try {
        backup = await downloadBackup(copy.id, restorePassword);
      } catch (error) {
        setBusy(null);
        fail('Nie udało się odczytać kopii', error);
        return;
      }
      setBusy(null);
      const stats = backupStats(backup);
      Alert.alert(
        'Przywrócić kopię?',
        `Kopia z ${formatDateTime(copy.createdAt)} zawiera ${formatNumber(stats.rows)} wierszy danych.\n\nWszystkie obecne dane w aplikacji zostaną zastąpione. Tej operacji nie można cofnąć.`,
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Przywróć',
            style: 'destructive',
            onPress: () => {
              try {
                const result = restoreBackup(db, backup);
                void syncWorkoutReminders();
                setRestorePassword('');
                Alert.alert('Przywrócono', `Wczytano ${formatNumber(result.rows)} wierszy danych.`);
              } catch (error) {
                fail('Nie udało się przywrócić', error);
              }
            },
          },
        ],
      );
    },
    [restorePassword],
  );

  const disconnect = () =>
    Alert.alert(
      'Odłączyć skrytkę?',
      'Z telefonu znikną adres, token i hasło. Kopie na serwerze zostają — żeby je odczytać, trzeba będzie podać hasło ponownie.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Odłącz',
          style: 'destructive',
          onPress: () => {
            void forgetRemote().then(() => {
              setConfigured(false);
              setAddressText('');
              setLastAt(null);
              setCopies(null);
            });
          },
        },
      ],
    );

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!configured ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Kopia całej bazy leci raz na dobę na Twój serwer — zaszyfrowana hasłem, którego
                serwer nie zna. Na serwerze musi stać plik backup.php z katalogu server
                w repozytorium; adres i token znajdziesz w jego konfiguracji.
              </ThemedText>

              <Field label="ADRES SKRYTKI">
                <TextInput
                  value={address}
                  onChangeText={setAddressText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://twojserwer.pl/formasync/backup.php"
                  placeholderTextColor={theme.textSecondary}
                  style={field}
                />
              </Field>

              <Field label="TOKEN Z CONFIG.PHP">
                <TextInput
                  value={token}
                  onChangeText={setTokenText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  placeholderTextColor={theme.textSecondary}
                  style={field}
                />
              </Field>

              <Field label="HASŁO DO SZYFROWANIA KOPII">
                <TextInput
                  value={password}
                  onChangeText={setPasswordText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  placeholderTextColor={theme.textSecondary}
                  style={field}
                />
              </Field>

              <Field label="HASŁO PONOWNIE">
                <TextInput
                  value={repeated}
                  onChangeText={setRepeated}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  placeholderTextColor={theme.textSecondary}
                  style={field}
                />
              </Field>

              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Zapisz to hasło poza telefonem.</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Tylko ono otwiera kopie. Nie mam żadnej furtki — każda działałaby też dla kogoś
                  obcego. Zgubione hasło to utracone kopie.
                </ThemedText>
              </ThemedView>

              <Button
                label="Podłącz skrytkę"
                icon="cloud_upload"
                onPress={() => void connect()}
                disabled={busy !== null || address.trim() === '' || token.trim() === '' || password === ''}
              />
            </>
          ) : (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Skrytka podłączona</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {address}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {lastAt === null
                    ? 'Jeszcze nie wysłano żadnej kopii.'
                    : `Ostatnia kopia: ${formatDateTime(lastAt)}.`}
                </ThemedText>
              </ThemedView>

              <Button
                label="Wyślij kopię teraz"
                icon="cloud_upload"
                onPress={() => void sendNow()}
                disabled={busy !== null}
              />

              <View style={styles.section}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  PRZYWRACANIE
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Przywrócenie zastępuje wszystkie dane w telefonie treścią wybranej kopii.
                </ThemedText>

                <Field label="HASŁO DO KOPII">
                  <TextInput
                    value={restorePassword}
                    onChangeText={setRestorePassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    placeholderTextColor={theme.textSecondary}
                    style={field}
                  />
                </Field>

                {copies === null ? (
                  <Button
                    label="Pokaż kopie na serwerze"
                    icon="list"
                    variant="secondary"
                    onPress={() => void loadCopies()}
                    disabled={busy !== null}
                  />
                ) : copies.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Na serwerze nie ma jeszcze żadnej kopii.
                  </ThemedText>
                ) : (
                  <View style={styles.chips}>
                    {copies.map((copy) => (
                      <Chip
                        key={copy.id}
                        label={formatDateTime(copy.createdAt)}
                        selected={false}
                        onPress={() => void restore(copy)}
                      />
                    ))}
                  </View>
                )}
              </View>

              <Button label="Odłącz skrytkę" icon="link_off" variant="secondary" onPress={disconnect} />
            </>
          )}

          {busy !== null && (
            <View style={styles.busy}>
              <ActivityIndicator />
              <ThemedText type="small" themeColor="textSecondary">
                {busy}
              </ThemedText>
            </View>
          )}

          <Button label="Wróć" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  field: { gap: Spacing.half },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
