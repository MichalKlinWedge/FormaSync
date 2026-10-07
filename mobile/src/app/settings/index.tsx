import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
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
import { HealthSection } from '@/features/health/health-section';
import { GarminAccountSection } from '@/features/garmin/connect/account-section';
import { describeBundle } from '@/features/updates/bundle';
import { findActiveSessionId } from '@/features/workout/repository';
import { ExportCanceled, readPickedTextFile, saveToPickedDirectory } from '@/lib/file-export';
import { formatNumber } from '@/lib/number';

export default function SettingsScreen() {
  const [busy, setBusy] = useState<null | 'export' | 'import'>(null);
  // Stałe expo-updates są ustalane przy starcie aplikacji — czytamy je raz, bez stanu.
  const bundle = describeBundle({
    isEnabled: Updates.isEnabled,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    updateId: Updates.updateId,
    createdAt: Updates.createdAt,
    channel: Updates.channel,
  });

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

        <RemoteBackupSection />

        <HealthSection />

        <GarminAccountSection />

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            O APLIKACJI
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            FormaSync 1.0.0 — dziennik treningu siłowego. Aplikacja działa bez internetu, a dane
            opuszczają telefon tylko tam, gdzie sam je wyślesz.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {bundle}
          </ThemedText>
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
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
