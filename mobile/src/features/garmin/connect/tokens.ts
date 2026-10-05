import * as SecureStore from 'expo-secure-store';

/**
 * Tokeny do Garmin Connect. Trzymamy je w SecureStore, a nie w bazie — baza jedzie w kopii
 * zapasowej, którą użytkownik przenosi na komputer i wysyła dalej; dostęp do konta nie ma
 * prawa tam trafić.
 *
 * Hasła nie zapisujemy nigdzie. Token OAuth1 jest długowieczny i wystarcza, żeby w nieskończoność
 * odnawiać krótkoterminowego bearera, więc o hasło pytamy wyłącznie przy pierwszym logowaniu.
 */

const OAUTH1_KEY = 'garmin_oauth1';
const OAUTH2_KEY = 'garmin_oauth2';

export type Oauth1Token = {
  oauthToken: string;
  oauthTokenSecret: string;
  mfaToken?: string;
};

export type Oauth2Token = {
  accessToken: string;
  /** Czas uniksowy w sekundach, po którym bearer jest nieważny. */
  expiresAt: number;
};

/** Zapas, z jakim uznajemy bearera za przeterminowanego — żeby nie wysłać go tuż przed końcem. */
const EXPIRY_MARGIN_SECONDS = 60;

export const isExpired = (token: Oauth2Token, now = Date.now()): boolean =>
  token.expiresAt - EXPIRY_MARGIN_SECONDS <= Math.floor(now / 1000);

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    // Uszkodzony albo nieodczytywalny wpis traktujemy jak brak — użytkownik zaloguje się ponownie.
    return null;
  }
}

export const loadOauth1 = () => read<Oauth1Token>(OAUTH1_KEY);
export const loadOauth2 = () => read<Oauth2Token>(OAUTH2_KEY);

export const saveOauth1 = (token: Oauth1Token) =>
  SecureStore.setItemAsync(OAUTH1_KEY, JSON.stringify(token));

export const saveOauth2 = (token: Oauth2Token) =>
  SecureStore.setItemAsync(OAUTH2_KEY, JSON.stringify(token));

/** Rozłączenie konta: znikają oba tokeny, zostaje tylko to, co w bazie. */
export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(OAUTH1_KEY);
  await SecureStore.deleteItemAsync(OAUTH2_KEY);
}

export const isConnected = async (): Promise<boolean> => (await loadOauth1()) !== null;
