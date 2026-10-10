import { getTableName, type Table } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

// Kopia zapasowa całej bazy jako jeden plik JSON. Dane żyją wyłącznie w telefonie,
// więc bez eksportu znikają razem z nim.

export const BACKUP_VERSION = 1;
const APP_MARKER = 'FormaSync';

/**
 * Tabele w kolejności zależności: rodzice przed dziećmi. Przywracanie wstawia w tej
 * kolejności, a czyści w odwrotnej, dzięki czemu klucze obce są spójne na każdym kroku
 * i nie trzeba ich wyłączać.
 */
const TABLES = [
  schema.categories,
  schema.equipment,
  schema.exercises,
  schema.exerciseMuscles,
  schema.workoutPlans,
  schema.planExercises,
  schema.planSegments,
  schema.scheduledWorkouts,
  schema.workoutSessions,
  schema.sessionExercises,
  schema.sessionSegments,
  schema.loggedSets,
  schema.loggedSegments,
  schema.garminActivityMetrics,
  schema.garminDailyHealth,
  schema.bodyMeasurements,
  schema.hydrationLogs,
  schema.hydrationDays,
  schema.trainingGoals,
  schema.goalWorkouts,
  schema.garminRecords,
  schema.archivedActivities,
  // Pamięć seeda jedzie razem z danymi — inaczej po przywróceniu kopii wróciłyby szablony,
  // które użytkownik wcześniej usunął.
  schema.seededTemplates,
  schema.appSettings,
] satisfies Table[];

export type Backup = {
  app: typeof APP_MARKER;
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export class BackupFormatError extends Error {}

export function createBackup(db: SyncDb, now = new Date().toISOString()): Backup {
  const tables: Backup['tables'] = {};
  for (const table of TABLES) {
    tables[getTableName(table)] = db.select().from(table).all() as Record<string, unknown>[];
  }
  return { app: APP_MARKER, version: BACKUP_VERSION, exportedAt: now, tables };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup);
}

/** Sprawdza, czy plik to kopia FormaSync w obsługiwanej wersji. Rzuca czytelnym błędem. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupFormatError('To nie jest plik kopii zapasowej — nie udało się odczytać zawartości.');
  }
  if (typeof data !== 'object' || data === null) {
    throw new BackupFormatError('Plik ma nieoczekiwaną zawartość.');
  }
  const candidate = data as Partial<Backup>;
  if (candidate.app !== APP_MARKER) {
    throw new BackupFormatError('Ten plik nie pochodzi z FormaSync.');
  }
  if (typeof candidate.version !== 'number' || candidate.version > BACKUP_VERSION) {
    throw new BackupFormatError(
      'Kopia pochodzi z nowszej wersji aplikacji. Zaktualizuj FormaSync i spróbuj ponownie.',
    );
  }
  if (typeof candidate.tables !== 'object' || candidate.tables === null) {
    throw new BackupFormatError('Kopia nie zawiera żadnych danych.');
  }
  return {
    app: APP_MARKER,
    version: candidate.version,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
    tables: candidate.tables as Backup['tables'],
  };
}

export type BackupStats = { tables: number; rows: number };

export function backupStats(backup: Backup): BackupStats {
  const counts = Object.values(backup.tables);
  return { tables: counts.length, rows: counts.reduce((sum, rows) => sum + rows.length, 0) };
}

/** Limit zmiennych w zapytaniu SQLite — duże tabele wstawiamy porcjami. */
const CHUNK = 100;

/**
 * Zastępuje całą zawartość bazy danymi z kopii. Operacja jest nieodwracalna, więc ekran
 * pyta o potwierdzenie. Wszystko dzieje się w jednej transakcji: błąd w połowie cofa całość.
 */
export function restoreBackup(db: SyncDb, backup: Backup): BackupStats {
  let rows = 0;
  db.transaction((tx) => {
    for (const table of [...TABLES].reverse()) {
      tx.delete(table).run();
    }
    for (const table of TABLES) {
      const values = backup.tables[getTableName(table)] ?? [];
      for (let i = 0; i < values.length; i += CHUNK) {
        const chunk = values.slice(i, i + CHUNK);
        // Wiersze pochodzą z tej samej wersji schematu, co sprawdza parseBackup.
        tx.insert(table)
          .values(chunk as never)
          .run();
      }
      rows += values.length;
    }
  });
  return { tables: TABLES.length, rows };
}

/** Nazwa pliku z datą: formasync-2026-10-01.json */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `formasync-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
