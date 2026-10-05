import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  GarminError,
  GarminMfaRequired,
  startLogin,
  submitMfaCode,
} from '@/features/garmin/connect/client';
import { useTheme } from '@/hooks/use-theme';

/**
 * Logowanie do Garmin Connect. Hasło żyje wyłącznie w stanie tego ekranu i w wywołaniu
 * logowania — po udanym logowaniu zostają same tokeny, a ekran się zamyka.
 */
export default function GarminLoginScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaMethod, setMfaMethod] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const field = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
      setPassword('');
      router.back();
    } catch (error) {
      if (error instanceof GarminMfaRequired) {
        setMfaMethod(error.method);
        setPassword('');
        setProblem(null);
      } else {
        setProblem(error instanceof GarminError ? error.message : describeNetworkFailure(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const logIn = () => void run(() => startLogin(email.trim(), password));
  const confirmCode = () => void run(() => submitMfaCode(code.trim(), mfaMethod ?? 'email'));

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {mfaMethod === null ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Zaloguj się danymi do Garmin Connect. Hasło posłuży wyłącznie do pobrania tokenów
                dostępu i nie zostanie nigdzie zapisane.
              </ThemedText>

              <View style={styles.field}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ADRES E-MAIL
                </ThemedText>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  placeholder="ty@example.com"
                  placeholderTextColor={theme.textSecondary}
                  style={field}
                />
              </View>

              <View style={styles.field}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  HASŁO
                </ThemedText>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  placeholderTextColor={theme.textSecondary}
                  style={field}
                />
              </View>

              <Button
                label="Zaloguj"
                icon="login"
                onPress={logIn}
                disabled={busy || email.trim() === '' || password === ''}
              />
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Konto wymaga potwierdzenia. Garmin wysłał kod ({describeMethod(mfaMethod)}) — wpisz go
                poniżej.
              </ThemedText>
              <View style={styles.field}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  KOD WERYFIKACYJNY
                </ThemedText>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  placeholder="000000"
                  placeholderTextColor={theme.textSecondary}
                  style={field}
                />
              </View>
              <Button
                label="Potwierdź"
                icon="check"
                onPress={confirmCode}
                disabled={busy || code.trim() === ''}
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

          {problem !== null && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small">{problem}</ThemedText>
            </ThemedView>
          )}

          <ThemedText type="small" themeColor="textSecondary">
            Logowanie przez Google lub Apple nie zadziała — Garmin prowadzi je inną drogą niż e-mail
            z hasłem. Jeśli konto jest z nimi powiązane, ustaw w Garmin Connect zwykłe hasło.
          </ThemedText>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const describeMethod = (method: string) =>
  method === 'sms' ? 'SMS-em' : method === 'authenticator' ? 'w aplikacji uwierzytelniającej' : 'e-mailem';

/** Błąd spoza API Garmina to prawie zawsze brak sieci — mówimy to wprost zamiast pokazywać ślad stosu. */
const describeNetworkFailure = (error: unknown) =>
  error instanceof Error && error.message
    ? `Nie udało się połączyć z Garminem: ${error.message}`
    : 'Nie udało się połączyć z Garminem. Sprawdź internet i spróbuj ponownie.';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  field: { gap: Spacing.one },
  input: { borderRadius: 12, padding: Spacing.three, fontSize: 16 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  card: { borderRadius: 12, padding: Spacing.three },
});
