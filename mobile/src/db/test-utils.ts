import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

import * as schema from './schema';
import { seedDatabase } from './seed';

/** Baza w pamięci z migracjami (tylko testy — uruchamiać w środowisku `node`). */
export function createTestDb({ seed = false } = {}) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  if (seed) seedDatabase(db);
  return db;
}
