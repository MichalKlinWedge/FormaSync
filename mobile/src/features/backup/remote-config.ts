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
const EMAIL_KEY = 'remote_backup_email';
const PENDING_KEY = 'remote_backup_pending';
const CLAIM_KEY = 'remote_backup_claim';

export const getAddress = (): string | null => getSetting(db, ADDRESS_KEY);
export const setAddress = (address: string | null): void => setSetting(db, ADDRESS_KEY, address);

export const getLastBackupAt = (): string | null => getSetting(db, LAST_AT_KEY);
export const setLastBackupAt = (iso: string): void => setSetting(db, LAST_AT_KEY, iso);

/**
 * Adres e-mail, na który skrytka jest zarejestrowana. Nie jest tajny i nie służy do niczego
 * w rozmowie z serwerem — po rejestracji wszystko nosi token. Trzymamy go, żeby ekran mówił,
 * czyja to półka, i żeby po utracie tokena było widać, który adres go odzyska.
 */
export const getEmail = (): string | null => getSetting(db, EMAIL_KEY);
export const setEmail = (email: string | null): void => setSetting(db, EMAIL_KEY, email);

export type PendingRegistration = { address: string; email: string };

/**
 * Rejestracja w toku: między wysłaniem listu a klikiem w link mija nieokreślony czas, często
 * z zamknięciem aplikacji pośrodku. Bez odłożenia tych dwóch rzeczy powrót do ekranu zaczynałby
 * wszystko od zera, a drugi list unieważniłby pierwszy.
 */
export function getPending(): PendingRegistration | null {
  const raw = getSetting(db, PENDING_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingRegistration>;
    if (typeof parsed.address !== 'string' || typeof parsed.email !== 'string') return null;
    return { address: parsed.address, email: parsed.email };
  } catch {
    // Uszkodzony wpis traktujemy jak brak — użytkownik zarejestruje się ponownie.
    return null;
  }
}

export const setPending = (pending: PendingRegistration): void =>
  setSetting(db, PENDING_KEY, JSON.stringify(pending));

export const clearPending = (): void => setSetting(db, PENDING_KEY, null);

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

/**
 * Sekret, którym telefon udowadnia, że to on zaczął rejestrację, i odbiera token. Idzie do
 * SecureStore razem z resztą sekretów: w bazie leżałby w kopii zapasowej, a kopia jedzie na
 * serwer, do którego ten sekret daje dostęp.
 */
export const getClaim = () => readSecret(CLAIM_KEY);
export const setClaim = (claim: string) => SecureStore.setItemAsync(CLAIM_KEY, claim);
export const clearClaim = () => SecureStore.deleteItemAsync(CLAIM_KEY).catch(() => undefined);

/** Zapomina skrytkę razem z sekretami. Kopie na serwerze zostają nietknięte. */
export async function forgetRemote(): Promise<void> {
  setAddress(null);
  setSetting(db, LAST_AT_KEY, null);
  setSetting(db, EMAIL_KEY, null);
  setSetting(db, PENDING_KEY, null);
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(PASSWORD_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(CLAIM_KEY).catch(() => undefined),
  ]);
}
