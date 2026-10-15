import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import {
  backupFileName,
  BackupFormatError,
  backupStats,
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from '@/features/backup/backup';

import { RemoteBackupSection } from '@/features/backup/remote-section';
import { syncWorkoutReminders } from '@/features/calendar/reminders';
import { WellnessSection } from '@/features/wellness/wellness-section';
import { GarminAccountSection } from '@/features/garmin/connect/account-section';
import { ProfileSection } from '@/features/profile/profile-section';
import { autoProgressionOn, setAutoProgression } from '@/features/progress/auto';
import { describeBundle } from '@/features/updates/bundle';
import { describeCheck, fetchNewerBundle } from '@/features/updates/check';
import { findActiveSessionId } from '@/features/workout/repository';
import { ExportCanceled, readPickedTextFile, saveToPickedDirectory } from '@/lib/file-export';
import { formatNumber } from '@/lib/number';

export default function SettingsScreen() {
  const [busy, setBusy] = useState<null | 'export' | 'import' | 'update'>(null);
  const [autoProgression, setAuto] = useState(() => autoProgressionOn(db));
  // Wersja z manifestu, nie wpisana w kod — inaczej rozjeżdża się z app.json przy pierwszym wydaniu.
  const appVersion = Constants.expoConfig?.version ?? '—';
  // Stałe expo-updates są ustalane przy starcie aplikacji — czytamy je raz, bez stanu.
  const bundle = describeBundle({
    isEnabled: Updates.isEnabled,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    updateId: Updates.updateId,
    createdAt: Updates.createdAt,
    channel: Updates.channel,
  });

  const checkForUpdate = async () => {
    setBusy('update');
    const check = await fetchNewerBundle(Updates);
    setBusy(null);

    const { title, message } = describeCheck(check);
    if (check.state !== 'ready') {
      Alert.alert(title, message);
      return;
    }
    Alert.alert(title, message, [
      { text: 'Później', style: 'cancel' },
      // Restart gubi tylko to, co na ekranie — dane siedzą w bazie, a trening wznawia się sam.
      { text: 'Uruchom teraz', onPress: () => void Updates.reloadAsync() },
    ]);
  };

  const exportData = async () => {
    setBusy('export');
    try {
      const backup = createBackup(db);
      const stats = backupStats(backup);
      const name = await saveToPickedDirectory(serializeBackup(backup), backupFileName(), 'application/json');
      Alert.alert('Kopia zapisana', `${name}\nZapisano ${formatNumber(stats.rows)} wierszy danych.`);
    } catch (e) {
      if (!(e instanceof ExportCanceled)) {
        Alert.alert('Nie udało się zapisać', describeError(e));
      }
    } finally {
      setBusy(null);
    }
  };

  const importData = async () => {
    if (findActiveSessionId(db) !== null) {
      Alert.alert('Trwa trening', 'Najpierw zakończ lub przerwij bieżący trening.');
      return;
    }
    setBusy('import');
    try {
      const backup = parseBackup(await readPickedTextFile(['application/json', 'text/plain', '*/*']));
      const stats = backupStats(backup);
      setBusy(null);
      Alert.alert(
        'Przywrócić kopię?',
        `Kopia zawiera ${formatNumber(stats.rows)} wierszy danych${
          backup.exportedAt ? ` z ${backup.exportedAt.slice(0, 10)}` : ''
        }.\n\nWszystkie obecne dane w aplikacji zostaną zastąpione. Tej operacji nie można cofnąć.`,
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Przywróć',
            style: 'destructive',
            onPress: () => {
              try {
                const result = restoreBackup(db, backup);
                void syncWorkoutReminders();
                Alert.alert('Przywrócono', `Wczytano ${formatNumber(result.rows)} wierszy danych.`);
              } catch (e) {
                Alert.alert('Nie udało się przywrócić', describeError(e));
              }
            },
          },
        ],
      );
    } catch (e) {
      setBusy(null);
      if (e instanceof ExportCanceled) return;
      Alert.alert(
        e instanceof BackupFormatError ? 'Nieprawidłowy plik' : 'Nie udało się wczytać',
        describeError(e),
      );
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            KOPIA ZAPASOWA
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Wszystkie dane — plany, historia treningów, pomiary ciała i własne ćwiczenia — są zapisane
            wyłącznie w tym telefonie. Kopia do pliku przydaje się, gdy chcesz mieć ją pod ręką;
            o kopię codzienną dba skrytka na serwerze poniżej.
          </ThemedText>

          <Button
            label="Zapisz kopię do pliku"
            icon="save"
            onPress={exportData}
            disabled={busy !== null}
          />
          <Button
            label="Przywróć z pliku"
            icon="restore"
            variant="secondary"
            onPress={importData}
            disabled={busy !== null}
          />
          {busy !== null && (
            <View style={styles.busy}>
              <ActivityIndicator />
              <ThemedText type="small" themeColor="textSecondary">
                {busy === 'export' ? 'Przygotowuję kopię…' : 'Wczytuję plik…'}
              </ThemedText>
            </View>
          )}
        </View>

        <ProfileSection />

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            PROGRESJA
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Po każdym zakończonym treningu — i po każdej poprawce w już zapisanym — plan dostaje
            ciężary na następny raz. Reguła jest ta sama, co w kreatorze progresji: komplet serii
            i powtórzeń to krok w górę, niepełne wykonanie albo wysokie RPE to ten sam ciężar,
            a połowa zaplanowanej pracy — krok w dół.
          </ThemedText>
          <View style={styles.chips}>
            <Chip
              label="Automatycznie"
              selected={autoProgression}
              onPress={() => {
                setAutoProgression(db, true);
                setAuto(true);
              }}
            />
            <Chip
              label="Pytaj mnie"
              selected={!autoProgression}
              onPress={() => {
                setAutoProgression(db, false);
                setAuto(false);
              }}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {autoProgression
              ? 'Po treningu zobaczysz, co się zmieniło. Zmiana dotyczy planu, z którego poszedł'
                + ' trening — szablony zostają nietknięte, a przy układaniu nowego planu ciężary'
                + ' i tak biorą się z Twojej historii.'
              : 'Nic nie dzieje się samo. Progresję odpalasz z ekranu planu, a cele z wykonanego'
                + ' treningu przepisujesz z historii.'}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            KALORIE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Budżet dnia liczony z przemiany podstawowej, ruchu, dzisiejszego treningu i celu diety.
            Bez celu — masa, utrzymanie czy redukcja — licznik kalorii nie odpowiada na żadne
            pytanie, więc od niego się zaczyna.
          </ThemedText>
          <Button
            label="Cel diety i dane"
            icon="restaurant"
            variant="secondary"
            onPress={() => router.push('/nutrition/settings')}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            NAWODNIENIE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Cel dnia liczony z masy ciała i dzisiejszego treningu, a przypomnienia tylko wtedy, gdy
            jesteś poniżej kreski na daną godzinę.
          </ThemedText>
          <Button
            label="Pilnowanie nawodnienia"
            icon="water_drop"
            variant="secondary"
            onPress={() => router.push('/hydration/settings')}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            MODELE AI
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Gemini, Claude i ChatGPT — klucz wklejasz tam, gdzie masz konto, i z tego samego
            korzystają plan pod cel, posiłek opisany słowami i propozycja jedzenia na dzień. Mając
            kilka, wybierasz domyślny, a przy pojedynczym zapytaniu wskazujesz inny. Bez żadnego
            klucza wszystko poza tym działa dalej.
          </ThemedText>
          <Button
            label="Klucze, modele i wytyczne"
            icon="key"
            variant="secondary"
            onPress={() => router.push('/goal/ai')}
          />
        </View>

        <RemoteBackupSection />

        <WellnessSection />

        <GarminAccountSection />

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            O APLIKACJI
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            FormaSync {appVersion} — dziennik treningu siłowego. Aplikacja działa bez internetu,
            a dane opuszczają telefon tylko tam, gdzie sam je wyślesz.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {bundle}
          </ThemedText>
          <Button
            label={busy === 'update' ? 'Sprawdzam…' : 'Sprawdź aktualizację'}
            icon="refresh"
            variant="secondary"
            onPress={checkForUpdate}
            disabled={busy !== null}
          />
          <Button
            label="Prywatność"
            icon="policy"
            variant="secondary"
            onPress={() => router.push('/settings/privacy')}
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const describeError = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'Nieznany błąd.';

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
