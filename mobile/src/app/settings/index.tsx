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
import { BackupCanceled, readBackupFile, writeBackupFile } from '@/features/backup/files';
import { syncWorkoutReminders } from '@/features/calendar/reminders';
import { findActiveSessionId } from '@/features/workout/repository';
import { formatNumber } from '@/lib/number';

export default function SettingsScreen() {
  const [busy, setBusy] = useState<null | 'export' | 'import'>(null);

  const exportData = async () => {
    setBusy('export');
    try {
      const backup = createBackup(db);
      const stats = backupStats(backup);
      const name = await writeBackupFile(serializeBackup(backup), backupFileName());
      Alert.alert('Kopia zapisana', `${name}\nZapisano ${formatNumber(stats.rows)} wierszy danych.`);
    } catch (e) {
      if (!(e instanceof BackupCanceled)) {
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
      const backup = parseBackup(await readBackupFile());
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
      if (e instanceof BackupCanceled) return;
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
            wyłącznie w tym telefonie. Rób kopię co jakiś czas i trzymaj ją poza telefonem, na przykład na
            Dysku Google.
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

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            O APLIKACJI
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            FormaSync 1.0.0 — dziennik treningu siłowego. Aplikacja działa bez internetu, a dane nie
            opuszczają telefonu.
          </ThemedText>
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
