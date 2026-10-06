import * as SecureStore from 'expo-secure-store';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';

/**
 * Ustawienia skrytki na kopie.
 *
 * Adres i data ostatniej wysyłki żyją w bazie — nie są tajne. Token i hasło **nie mogą** tam
 * trafić: baza jedzie w każdej kopii zapasowej, więc klucz do skrytki leżałby w środku rzeczy,
 * którą ma chronić. Oba idą do SecureStore, tak samo jak tokeny Garmina.
 */

const ADDRESS_KEY = 'remote_backup_address';
const LAST_AT_KEY = 'remote_backup_last_at';
const TOKEN_KEY = 'remote_backup_token';
const PASSWORD_KEY = 'remote_backup_password';

export const getAddress = (): string | null => getSetting(db, ADDRESS_KEY);
export const setAddress = (address: string | null): void => setSetting(db, ADDRESS_KEY, address);

export const getLastBackupAt = (): string | null => getSetting(db, LAST_AT_KEY);
export const setLastBackupAt = (iso: string): void => setSetting(db, LAST_AT_KEY, iso);

const readSecret = async (key: string): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // Nieodczytywalny wpis traktujemy jak brak — użytkownik poda go ponownie.
    return null;
  }
};

export const getToken = () => readSecret(TOKEN_KEY);
export const getPassword = () => readSecret(PASSWORD_KEY);

export const setToken = (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const setPassword = (password: string) => SecureStore.setItemAsync(PASSWORD_KEY, password);

/** Zapomina skrytkę razem z sekretami. Kopie na serwerze zostają nietknięte. */
export async function forgetRemote(): Promise<void> {
  setAddress(null);
  setSetting(db, LAST_AT_KEY, null);
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(PASSWORD_KEY).catch(() => undefined),
  ]);
}
