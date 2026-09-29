import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

// Synchroniczna baza Drizzle/SQLite (expo-sqlite w aplikacji, better-sqlite3 w testach).
// Sterownik expo-sqlite jest synchroniczny — w transakcjach używamy .all()/.get()/.run(),
// bo `await` na zapytaniu wykonałby je dopiero po COMMIT.
export type SyncDb = BaseSQLiteDatabase<'sync', unknown, typeof schema>;
