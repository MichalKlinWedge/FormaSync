import { asc, eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

import type { GarminRecord } from './connect/records';

/**
 * Rekordy z Garmina w bazie. Zapisujemy je, żeby były pod ręką bez internetu — ekran statystyk
 * ma je pokazywać także wtedy, gdy telefon jest w trybie samolotowym w drodze na zawody.
 */

/** Kolejność wyświetlania: od najkrótszego dystansu, najdłuższy bieg na końcu. */
const ORDER: string[] = ['DIST_1K', 'DIST_5K', 'DIST_10K', 'DIST_HALF', 'DIST_MARATHON', 'LONGEST_RUN'];

export type StoredRecord = typeof schema.garminRecords.$inferSelect;

/** Zapisuje rekordy, nadpisując poprzednie. Zwraca, ile ich doszło. */
export function saveGarminRecords(
  db: SyncDb,
  records: GarminRecord[],
  sport: schema.Sport = 'RUNNING',
): number {
  for (const record of records) {
    const values = {
      recordKey: record.recordKey,
      sport,
      label: record.label,
      distanceMeters: record.distanceMeters,
      seconds: record.seconds,
      achievedOn: record.achievedOn,
    };
    db.insert(schema.garminRecords)
      .values(values)
      .onConflictDoUpdate({ target: schema.garminRecords.recordKey, set: values })
      .run();
  }
  return records.length;
}

export function listGarminRecords(db: SyncDb, sport: schema.Sport): StoredRecord[] {
  return db
    .select()
    .from(schema.garminRecords)
    .where(eq(schema.garminRecords.sport, sport))
    .orderBy(asc(schema.garminRecords.recordKey))
    .all()
    .sort((a, b) => ORDER.indexOf(a.recordKey) - ORDER.indexOf(b.recordKey));
}
