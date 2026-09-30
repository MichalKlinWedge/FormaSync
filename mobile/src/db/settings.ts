import { eq } from 'drizzle-orm';

import { appSettings } from './schema';
import type { SyncDb } from './types';

/** Proste ustawienia klucz–wartość. Sekrety trzymamy w expo-secure-store, nie tutaj. */
export function getSetting(db: SyncDb, key: string): string | null {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get()?.value ?? null;
}

export function setSetting(db: SyncDb, key: string, value: string | null): void {
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}
