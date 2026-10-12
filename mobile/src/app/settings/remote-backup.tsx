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
  getEmail,
  getLastBackupAt,
  getPassword,
  getPending,
  setAddress,
  setPassword,
  setToken,
} from '@/features/backup/remote-config';
import { finishRegistration, startRegistration } from '@/features/backup/registration';
import { syncWorkoutReminders } from '@/features/calendar/reminders';
import { findActiveSessionId } from '@/features/workout/repository';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/date';
import { formatNumber } from '@/lib/number';

/**
 * Skrytka na kopie zapasowe: adres własnego serwera, token i hasło, którym zamykamy kopię.
 * Hasło prosi o osobny ekran z tego samego powodu co logowanie do Garmina — pole na hasło nie
 * ma czego szukać pośrodku listy ustawień.
 *
 * Dwie drogi do półki na serwerze. Albo administrator dał Ci gotowy token, albo rejestrujesz się
 * adresem e-mail i token przychodzi sam. Pierwsza jest krótsza, druga nie wymaga, żeby ktoś
 * przepisywał sekrety ręcznie — i tylko ona pozwala odzyskać dostęp po zmianie telefonu.
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
  const [mode, setMode] = useState<'token' | 'email'>('token');
  const [email, setEmailText] = useState('');
  const [invite, setInviteText] = useState('');
  const [pending, setPendingState] = useState(() => getPending());
  const [owner, setOwner] = useState(() => getEmail());

  const field = [
    styles.input,
    { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
  ];

  const fail = (title: string, error: unknown) =>
    Alert.alert(title, error instanceof Error ? error.message : 'Nieznany błąd.');

  /** Hasło sprawdzamy w jednym miejscu, bo obie drogi do skrytki zaczynają się od niego. */
  const passwordAccepted = (): boolean => {
    if (password !== repeated) {
      Alert.alert('Hasła się różnią', 'Wpisz to samo hasło dwa razy — przy literówce kopie byłyby nie do odczytania.');
      return false;
    }
    if (password.length < 8) {
      Alert.alert('Za krótkie hasło', 'Hasło chroni wszystkie kopie na serwerze. Daj mu przynajmniej 8 znaków.');
      return false;
    }
    return true;
  };

  const connect = async () => {
    if (!passwordAccepted()) return;
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

  /**
   * Hasło zapisujemy już tutaj, przed potwierdzeniem adresu. Rejestracja przerywa się na czas
   * nieokreślony — list bywa czytany nazajutrz, często na innym urządzeniu — a druga wizyta na
   * tym ekranie nie ma prawa pytać o hasło ponownie: wpisane drugi raz z pamięci bywa inne,
   * a wtedy kopie zamknęłyby się czymś, czego nikt już nie odtworzy.
   */
  const register = async () => {
    if (!passwordAccepted()) return;
    setBusy('Zgłaszam adres…');
    try {
      await setPassword(password);
      const hours = await startRegistration({ address, inviteToken: invite, email });
      setPendingState(getPending());
      setPasswordText('');
      setRepeated('');
      setInviteText('');
      Alert.alert(
        'List w drodze',
        `Otwórz link z wiadomości na ${email.trim().toLowerCase()} — jest ważny ${hours} h — a potem wróć tutaj i naciśnij „Dokończ rejestrację”.`,
      );
    } catch (error) {
      fail('Nie udało się zgłosić adresu', error);
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    setBusy('Sprawdzam potwierdzenie…');
    try {
      if ((await finishRegistration()) === 'pending') {
        Alert.alert(
          'Adres jeszcze niepotwierdzony',
          'Otwórz link z wiadomości, a potem naciśnij ten przycisk jeszcze raz. Zajrzyj też do spamu — to pierwszy list z tego serwera, więc najłatwiej tam trafia.',
        );
        return;
      }
      setPendingState(null);
      setOwner(getEmail());
      setAddressText(getAddress() ?? '');
      setConfigured(true);
      Alert.alert(
        'Skrytka podłączona',
        'Kopia poleci teraz i potem raz na dobę przy uruchomieniu aplikacji. Zapisz hasło poza telefonem — adres e-mail odzyska token, ale hasła nie odzyska nic.',
      );
    } catch (error) {
      fail('Nie udało się dokończyć rejestracji', error);
    } finally {
      setBusy(null);
    }
  };

  const abandon = () =>
    Alert.alert(
      'Przerwać rejestrację?',
      'Zgłoszenie na serwerze zostanie bez odbioru i wygaśnie samo. Możesz zacząć od nowa, kiedy chcesz.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Przerwij',
          style: 'destructive',
          onPress: () => {
            void forgetRemote().then(() => setPendingState(null));
          },
        },
      ],
    );

  const sendNow = async () => {
    setBusy('Szyfruję i wysyłam… to potrwa kilkanaście sekund.');
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
      // Na tym telefonie hasło już jest — służy do codziennej kopii. Puste pole znaczy
      // „użyj tego, co zapamiętane”; wpisanie czegoś pozwala odczytać kopię zamkniętą innym
      // hasłem, na przykład przeniesioną ze starego telefonu.
      const key = restorePassword === '' ? await getPassword() : restorePassword;
      if (key === null || key === '') {
        Alert.alert('Podaj hasło', 'Kopie są zaszyfrowane — bez hasła nie da się ich otworzyć.');
        return;
      }
      setBusy('Pobieram i odszyfrowuję… to potrwa kilkanaście sekund.');
      let backup;
      try {
        backup = await downloadBackup(copy.id, key);
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
              setOwner(null);
              setPendingState(null);
            });
          },
        },
      ],
    );

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!configured && pending !== null ? (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Potwierdź adres {pending.email}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Poszedł tam list z linkiem. Otwórz go — choćby na komputerze — i wróć tutaj.
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Tokena w tym liście nie ma i być nie może: poczta zostaje w skrzynce na lata.
                  Token odbierze wyłącznie ten telefon, bo tylko on zna sekret rejestracji.
                </ThemedText>
              </ThemedView>

              <Button
                label="Dokończ rejestrację"
                icon="check"
                onPress={() => void finish()}
                disabled={busy !== null}
              />
              <Button
                label="Przerwij rejestrację"
                icon="close"
                variant="secondary"
                onPress={abandon}
                disabled={busy !== null}
              />
            </>
          ) : !configured ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Kopia całej bazy leci raz na dobę na Twój serwer — zaszyfrowana hasłem, którego
                serwer nie zna. Na serwerze musi stać plik backup.php z katalogu server
                w repozytorium.
              </ThemedText>

              <View style={styles.chips}>
                <Chip label="Mam token" selected={mode === 'token'} onPress={() => setMode('token')} />
                <Chip
                  label="Zarejestruj e-mailem"
                  selected={mode === 'email'}
                  onPress={() => setMode('email')}
                />
              </View>

              <ThemedText type="small" themeColor="textSecondary">
                {mode === 'token'
                  ? 'Token właściciela wpisany w config.php na serwerze. Najkrótsza droga, jeśli serwer jest Twój.'
                  : 'Na podany adres przyjdzie list z linkiem; token przyjdzie sam i to jedyny sposób odzyskania dostępu po zmianie telefonu. Token zaproszenia dostajesz od administratora skrytki.'}
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

              {mode === 'token' ? (
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
              ) : (
                <>
                  <Field label="ADRES E-MAIL">
                    <TextInput
                      value={email}
                      onChangeText={setEmailText}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      placeholder="ty@przyklad.pl"
                      placeholderTextColor={theme.textSecondary}
                      style={field}
                    />
                  </Field>

                  <Field label="TOKEN ZAPROSZENIA">
                    <TextInput
                      value={invite}
                      onChangeText={setInviteText}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      placeholderTextColor={theme.textSecondary}
                      style={field}
                    />
                  </Field>
                </>
              )}

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
                {mode === 'email' && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Rejestracja adresem nic tu nie zmienia: e-mail odzyskuje token, czyli dostęp
                    do półki na serwerze. Hasła nie odzyskuje — leżące tam koperty otwiera
                    wyłącznie ono.
                  </ThemedText>
                )}
              </ThemedView>

              {mode === 'token' ? (
                <Button
                  label="Podłącz skrytkę"
                  icon="cloud_upload"
                  onPress={() => void connect()}
                  disabled={
                    busy !== null || address.trim() === '' || token.trim() === '' || password === ''
                  }
                />
              ) : (
                <Button
                  label="Zgłoś adres i wyślij list"
                  icon="mail"
                  onPress={() => void register()}
                  disabled={
                    busy !== null ||
                    address.trim() === '' ||
                    email.trim() === '' ||
                    invite.trim() === '' ||
                    password === ''
                  }
                />
              )}
            </>
          ) : (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">Skrytka podłączona</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {address}
                </ThemedText>
                {owner !== null && (
                  // Adres mówi, czyja to półka, i którym adresem odzyskać token po zmianie
                  // telefonu. Bez tej linijki trzeba by go zgadywać.
                  <ThemedText type="small" themeColor="textSecondary">
                    Zarejestrowana na {owner}.
                  </ThemedText>
                )}
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
                  Hasło zostaw puste, żeby użyć zapamiętanego na tym telefonie.
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
