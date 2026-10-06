import type { Envelope } from './envelope';

/**
 * Rozmowa ze skrytką na kopie (`server/backup.php`). Wysyłamy zamkniętą kopertę i potrafimy
 * odczytać spis oraz pobrać wybraną kopię. Serwer nie zna hasła, więc wszystko, co tu jedzie,
 * jest dla niego nieczytelne.
 */

const TOKEN_HEADER = 'X-FormaSync-Token';

export class RemoteBackupError extends Error {}

/** Adres podany przez użytkownika. Wymagamy HTTPS — po HTTP token jedzie otwartym tekstem. */
export function checkAddress(raw: string): string {
  const address = raw.trim();
  if (address === '') throw new RemoteBackupError('Podaj adres skrytki.');
  if (!/^https:\/\/[^\s/]+\/\S*$/i.test(address)) {
    if (/^http:\/\//i.test(address)) {
      throw new RemoteBackupError('Adres musi zaczynać się od https:// — po http token jedzie otwartym tekstem.');
    }
    throw new RemoteBackupError('Adres powinien wyglądać tak: https://twojserwer.pl/formasync/backup.php');
  }
  return address;
}

export type RemoteBackup = { id: number; createdAt: string; device: string; size: number };

export type RemoteConnection = { address: string; token: string };

async function call(
  connection: RemoteConnection,
  path: string,
  init: { method?: string; body?: string } = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${connection.address}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        [TOKEN_HEADER]: connection.token,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body,
    });
  } catch {
    throw new RemoteBackupError('Nie udało się połączyć z serwerem. Sprawdź adres i internet.');
  }
  if (response.status === 401) throw new RemoteBackupError('Serwer odrzucił token.');
  if (!response.ok) throw new RemoteBackupError(await describeFailure(response));
  return response;
}

/** Serwer tłumaczy swoje odmowy po polsku; gdy odpowie czymś innym, zostaje sam kod. */
async function describeFailure(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error !== '') return body.error;
  } catch {
    // Odpowiedź bez JSON-a to zwykle strona błędu serwera WWW — nie ma z niej czego czytać.
  }
  return `Serwer odpowiedział błędem (kod ${response.status}).`;
}

export async function uploadBackup(
  connection: RemoteConnection,
  envelope: Envelope,
): Promise<{ id: number; size: number }> {
  const response = await call(connection, '', { method: 'POST', body: JSON.stringify(envelope) });
  return (await response.json()) as { id: number; size: number };
}

export async function listRemoteBackups(connection: RemoteConnection): Promise<RemoteBackup[]> {
  const response = await call(connection, '?list=1');
  const body = (await response.json()) as { backups?: unknown };
  if (!Array.isArray(body.backups)) throw new RemoteBackupError('Serwer odpowiedział nie tym, czym trzeba.');
  return body.backups as RemoteBackup[];
}

/** Pobiera kopertę. Rozpakowanie hasłem jest osobnym krokiem — tu jest tylko transport. */
export async function fetchRemoteBackup(connection: RemoteConnection, id: number): Promise<unknown> {
  const response = await call(connection, `?id=${id}`);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new RemoteBackupError('Pobrana kopia jest uszkodzona.');
  }
}
