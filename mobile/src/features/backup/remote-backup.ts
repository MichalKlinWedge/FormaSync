import { db } from '@/db/client';

import { createBackup, parseBackup, serializeBackup, type Backup } from './backup';
import { openBackup, sealBackup } from './envelope';
import {
  getAddress,
  getLastBackupAt,
  getPassword,
  getToken,
  setLastBackupAt,
} from './remote-config';
import {
  fetchRemoteBackup,
  listRemoteBackups,
  RemoteBackupError,
  uploadBackup,
  type RemoteBackup,
  type RemoteConnection,
} from './remote';

/** Składanie kopii, zamykanie jej hasłem i wysyłka — razem, bo osobno nie mają sensu. */

const DAY_MS = 24 * 3600 * 1000;

/**
 * Czy pora na kopię. Raz na dobę wystarczy: dane zmieniają się o jeden trening dziennie, a
 * każda wysyłka to sekunda liczenia klucza i ruch w sieci. Brak poprzedniej kopii znaczy „tak”.
 */
export function shouldBackUpNow(lastAt: string | null, now: Date = new Date()): boolean {
  if (lastAt === null) return true;
  const last = Date.parse(lastAt);
  if (Number.isNaN(last)) return true;
  // Zegar cofnięty ręcznie nie może zablokować kopii na zawsze.
  return now.getTime() - last >= DAY_MS || now.getTime() < last;
}

export class RemoteNotConfiguredError extends Error {
  constructor() {
    super('Skrytka na kopie nie jest jeszcze ustawiona.');
  }
}

/** Adres z tokenem, albo błąd. Hasło czytamy osobno, bo do spisu kopii nie jest potrzebne. */
export async function connection(): Promise<RemoteConnection> {
  const address = getAddress();
  const token = await getToken();
  if (address === null || token === null) throw new RemoteNotConfiguredError();
  return { address, token };
}

export async function sendBackupNow(
  device = '',
  options: { background?: boolean } = {},
): Promise<{ id: number; size: number }> {
  const link = await connection();
  const password = await getPassword();
  if (password === null) throw new RemoteNotConfiguredError();

  const sealed = await sealBackup(serializeBackup(createBackup(db)), password, {
    device,
    background: options.background,
  });
  const result = await uploadBackup(link, sealed);
  setLastBackupAt(new Date().toISOString());
  return result;
}

/**
 * Kopia w tle przy starcie aplikacji. Każdy powód niewysłania jest tu zwyczajny — brak
 * ustawień, brak internetu — więc nie zawracamy nimi głowy; o niepowodzeniu mówi data
 * ostatniej kopii w Ustawieniach, która przestaje się zmieniać.
 */
export async function backUpInBackground(device = ''): Promise<boolean> {
  if (getAddress() === null || !shouldBackUpNow(getLastBackupAt())) return false;
  try {
    // W tle nie wolno zablokować wątku: aplikacja właśnie się uruchomiła i użytkownik
    // chce z niej korzystać, a nie patrzeć na zamrożony ekran.
    await sendBackupNow(device, { background: true });
    return true;
  } catch {
    return false;
  }
}

export const listBackups = async (): Promise<RemoteBackup[]> => listRemoteBackups(await connection());

/** Pobiera kopię z serwera i otwiera ją hasłem. Nie dotyka jeszcze bazy. */
export async function downloadBackup(id: number, password: string): Promise<Backup> {
  const envelope = await fetchRemoteBackup(await connection(), id);
  return parseBackup(await openBackup(envelope, password));
}

export { RemoteBackupError };
