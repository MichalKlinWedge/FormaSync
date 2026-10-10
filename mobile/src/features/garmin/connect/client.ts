import { authorizationHeader, type OAuth1Credentials } from './oauth1';
import {
  clearTokens,
  isExpired,
  loadOauth1,
  loadOauth2,
  type Oauth1Token,
  type Oauth2Token,
  saveOauth1,
  saveOauth2,
} from './tokens';

/**
 * Rozmowa z Garmin Connect tą samą drogą, co aplikacja mobilna Garmina: logowanie przez SSO,
 * wymiana biletu na token OAuth1, a z niego na krótkoterminowego bearera.
 *
 * To nieoficjalne API. Garmin może je zmienić bez zapowiedzi i wtedy synchronizacja przestanie
 * działać — dlatego każdy błąd nazywamy po imieniu zamiast udawać, że to usterka sieci.
 */

const CLIENT_ID = 'GCM_ANDROID_DARK';
const SSO = 'https://sso.garmin.com';
const CONNECT_API = 'https://connectapi.garmin.com';
const SERVICE_URL = 'https://mobile.integration.garmin.com/gcm/android';
const CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json';

/** Strony logowania chodzą w widoku przeglądarki — klient HTTP dostaje tam zaporę Cloudflare. */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Klucz konsumenta jest androidowy, więc i nagłówek musi być androidowy. */
const OAUTH_HEADERS = { 'User-Agent': 'com.garmin.android.apps.connectmobile' };

export class GarminError extends Error {}

/** Konto niepołączone — nie ma skąd czytać i nie ma czego naprawiać poza zalogowaniem się. */
export class GarminNotConnectedError extends GarminError {
  constructor() {
    super('Brak połączenia z Garmin Connect.');
  }
}

/** Hasło odrzucone przez Garmina — jedyny błąd, który użytkownik naprawia sam. */
export class GarminLoginError extends GarminError {}

/** Konto wymaga kodu dwuskładnikowego; logowanie trzeba dokończyć osobnym krokiem. */
export class GarminMfaRequired extends GarminError {
  constructor(readonly method: string) {
    super('Konto wymaga kodu weryfikacyjnego.');
  }
}

/** Tokeny przestały działać — trzeba zalogować się ponownie. */
export class GarminAuthExpired extends GarminError {
  constructor() {
    super('Połączenie z Garmin Connect wygasło. Zaloguj się ponownie.');
  }
}

const loginParams = () =>
  `clientId=${CLIENT_ID}&locale=en-US&service=${encodeURIComponent(SERVICE_URL)}`;

let consumer: OAuth1Credentials | null = null;

/**
 * Klucz konsumenta OAuth1. Garmin nie wydaje go osobno aplikacjom — leży pod stałym adresem,
 * tym samym, z którego korzysta biblioteka pythonowa. Pobieramy go raz na uruchomienie.
 */
async function oauthConsumer(): Promise<OAuth1Credentials> {
  if (consumer) return consumer;
  const response = await fetch(CONSUMER_URL);
  if (!response.ok) throw new GarminError('Nie udało się pobrać klucza logowania Garmina.');
  const body = (await response.json()) as { consumer_key: string; consumer_secret: string };
  consumer = { consumerKey: body.consumer_key, consumerSecret: body.consumer_secret };
  return consumer;
}

type LoginResponse = {
  responseStatus?: { type?: string; message?: string };
  serviceTicketId?: string;
  customerMfaInfo?: { mfaLastMethodUsed?: string };
};

/**
 * Pierwszy krok: e-mail i hasło w zamian za bilet. Hasło żyje wyłącznie w tym wywołaniu —
 * nie zapisujemy go i nie wypisujemy w żadnym komunikacie.
 */
export async function startLogin(email: string, password: string): Promise<void> {
  // Zapytanie o stronę logowania ustawia ciasteczka, bez których kolejny krok jest odrzucany.
  await fetch(`${SSO}/mobile/sso/en/sign-in?clientId=${CLIENT_ID}`, { headers: BROWSER_HEADERS });

  const response = await fetch(`${SSO}/mobile/api/login?${loginParams()}`, {
    method: 'POST',
    headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email, password, rememberMe: false, captchaToken: '' }),
  });

  const body = (await response.json().catch(() => ({}))) as LoginResponse;
  const status = body.responseStatus?.type;

  if (status === 'MFA_REQUIRED') {
    throw new GarminMfaRequired(body.customerMfaInfo?.mfaLastMethodUsed ?? 'email');
  }
  if (status !== 'SUCCESSFUL' || !body.serviceTicketId) {
    throw new GarminLoginError(describeLoginFailure(body, response.status));
  }
  await completeLogin(body.serviceTicketId);
}

/** Drugi krok logowania dwuskładnikowego: kod z wiadomości w zamian za bilet. */
export async function submitMfaCode(code: string, method: string): Promise<void> {
  const response = await fetch(`${SSO}/mobile/api/mfa/verifyCode?${loginParams()}`, {
    method: 'POST',
    headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mfaMethod: method,
      mfaVerificationCode: code,
      rememberMyBrowser: false,
      reconsentList: [],
      mfaSetup: false,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as LoginResponse;
  if (body.responseStatus?.type !== 'SUCCESSFUL' || !body.serviceTicketId) {
    throw new GarminLoginError('Kod nie został przyjęty. Sprawdź go i spróbuj jeszcze raz.');
  }
  await completeLogin(body.serviceTicketId);
}

export function describeLoginFailure(body: LoginResponse, httpStatus: number): string {
  const message = body.responseStatus?.message;
  if (message) return message;
  if (httpStatus === 401 || httpStatus === 403) return 'Garmin odrzucił adres e-mail lub hasło.';
  if (httpStatus === 429) return 'Garmin chwilowo blokuje logowania. Spróbuj za kilka minut.';
  return `Logowanie nie powiodło się (kod ${httpStatus}).`;
}

/** Bilet → token OAuth1 → bearer. Oba zapisujemy; od tej pory hasło nie jest już potrzebne. */
async function completeLogin(ticket: string): Promise<void> {
  const oauth1 = await fetchOauth1(ticket);
  await saveOauth1(oauth1);
  await saveOauth2(await exchange(oauth1));
}

async function fetchOauth1(ticket: string): Promise<Oauth1Token> {
  const url =
    `${CONNECT_API}/oauth-service/oauth/preauthorized?ticket=${encodeURIComponent(ticket)}` +
    `&login-url=${encodeURIComponent(SERVICE_URL)}&accepts-mfa-tokens=true`;
  const credentials = await oauthConsumer();
  const response = await fetch(url, {
    headers: { ...OAUTH_HEADERS, Authorization: authorizationHeader('GET', url, credentials) },
  });
  if (!response.ok) throw new GarminError('Garmin nie wydał tokenu dostępu.');

  const fields = parseQuery(await response.text());
  const token = fields.oauth_token;
  const secret = fields.oauth_token_secret;
  if (!token || !secret) throw new GarminError('Odpowiedź Garmina nie zawierała tokenu.');
  return { oauthToken: token, oauthTokenSecret: secret, mfaToken: fields.mfa_token };
}

/** Token OAuth1 → bearer. Tym samym krokiem odnawiamy wygasłego bearera. */
async function exchange(oauth1: Oauth1Token, firstTime = true): Promise<Oauth2Token> {
  const url = `${CONNECT_API}/oauth-service/oauth/exchange/user/2.0`;
  const body: Record<string, string> = {};
  if (firstTime) body.audience = 'GARMIN_CONNECT_MOBILE_ANDROID_DI';
  if (oauth1.mfaToken) body.mfa_token = oauth1.mfaToken;

  const credentials: OAuth1Credentials = {
    ...(await oauthConsumer()),
    token: oauth1.oauthToken,
    tokenSecret: oauth1.oauthTokenSecret,
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...OAUTH_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: authorizationHeader('POST', url, credentials, { body }),
    },
    body: encodeForm(body),
  });
  if (!response.ok) throw new GarminAuthExpired();

  const token = (await response.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: token.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + token.expires_in,
  };
}

/** Ważny bearer: zapisany, póki nie wygaśnie, potem wymieniony na nowy. */
async function bearer(): Promise<string> {
  const oauth1 = await loadOauth1();
  if (!oauth1) throw new GarminAuthExpired();

  const saved = await loadOauth2();
  if (saved && !isExpired(saved)) return saved.accessToken;

  try {
    const fresh = await exchange(oauth1, false);
    await saveOauth2(fresh);
    return fresh.accessToken;
  } catch (error) {
    // Token OAuth1 też przestał działać — kasujemy oba, żeby ekran pokazał „połącz ponownie”
    // zamiast w kółko próbować nieważnymi danymi.
    await clearTokens();
    throw error instanceof GarminError ? error : new GarminAuthExpired();
  }
}

/** Zapytanie do API Garmina z ważnym bearerem. Zwraca odpowiedź w postaci JSON. */
export async function connectApi<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T | null> {
  const token = await bearer();
  const response = await fetch(`${CONNECT_API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...OAUTH_HEADERS,
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (response.status === 401 || response.status === 403) {
    await clearTokens();
    throw new GarminAuthExpired();
  }
  if (!response.ok) {
    throw new GarminError(`Garmin odrzucił zapytanie (kod ${response.status}).`);
  }
  if (response.status === 204) return null;
  return (await response.json()) as T;
}

export function parseQuery(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const pair of text.split('&')) {
    if (!pair) continue;
    const at = pair.indexOf('=');
    const key = at === -1 ? pair : pair.slice(0, at);
    const value = at === -1 ? '' : pair.slice(at + 1);
    fields[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return fields;
}

const encodeForm = (body: Record<string, string>): string =>
  Object.entries(body)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

export { clearTokens, isConnected } from './tokens';
