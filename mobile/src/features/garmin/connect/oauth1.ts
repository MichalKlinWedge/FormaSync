import { sha1 } from 'js-sha1';

/**
 * Podpis OAuth 1.0a (HMAC-SHA1) wedle RFC 5849. Garmin podpisuje nim dwa zapytania:
 * wymianę biletu logowania na token i wymianę tokenu na bearera. Reszta rozmowy idzie
 * już zwykłym nagłówkiem `Authorization: Bearer …`.
 *
 * Całość jest czystą funkcją bez sieci, żeby dało się ją sprawdzić testem na wektorach z normy.
 */

export type OAuth1Credentials = {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
};

/**
 * Kodowanie procentowe wedle §3.6: niezarezerwowane zostają, reszta idzie na wielkie hex.
 * `encodeURIComponent` zostawia `!'()*`, których norma nie zalicza do niezarezerwowanych.
 */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Parametry po normalizacji z §3.4.1.3.2: zakodowane, posortowane po kluczu, potem po wartości. */
function normalizeParameters(params: [string, string][]): string {
  return params
    .map(([key, value]): [string, string] => [percentEncode(key), percentEncode(value)])
    .sort(([keyA, valueA], [keyB, valueB]) =>
      keyA === keyB ? (valueA < valueB ? -1 : valueA > valueB ? 1 : 0) : keyA < keyB ? -1 : 1,
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/**
 * Rozbiór adresu bez `URL`. Hermes ma tę klasę okrojoną — `searchParams` potrafi nie istnieć,
 * a wtedy podpis wychodziłby bez parametrów zapytania i Garmin odrzucałby zapytanie dopiero
 * na urządzeniu. Wzorzec obsługuje tyle, ile tu potrzeba: schemat, host, ścieżkę i zapytanie.
 */
const URL_PATTERN = /^(https?:\/\/[^/?#]+)([^?#]*)(?:\?([^#]*))?/i;

/** Adres bez zapytania i bez fragmentu — te trafiają osobno do listy parametrów (§3.4.1.2). */
function baseUrl(url: string): string {
  const match = URL_PATTERN.exec(url);
  if (!match) throw new Error(`Nie rozumiem adresu: ${url}`);
  return `${match[1]}${match[2] || '/'}`;
}

function queryParameters(url: string): [string, string][] {
  const query = URL_PATTERN.exec(url)?.[3];
  if (!query) return [];
  return query
    .split('&')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const at = pair.indexOf('=');
      const [key, value] = at === -1 ? [pair, ''] : [pair.slice(0, at), pair.slice(at + 1)];
      // W zapytaniu plus znaczy spację; podpis liczy się z wartości rozkodowanych.
      return [decodeURIComponent(key.replace(/\+/g, ' ')), decodeURIComponent(value.replace(/\+/g, ' '))];
    });
}

/** Tekst, który faktycznie podpisujemy (§3.4.1.1). */
export function signatureBaseString(
  method: string,
  url: string,
  params: [string, string][],
): string {
  return [
    method.toUpperCase(),
    percentEncode(baseUrl(url)),
    percentEncode(normalizeParameters(params)),
  ].join('&');
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 z bajtów. Piszemy ręcznie, bo `btoa` w Hermesie bywa nieobecny. */
function toBase64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const left = bytes.length - i;
    out += BASE64[(chunk >> 18) & 63] + BASE64[(chunk >> 12) & 63];
    out += left > 1 ? BASE64[(chunk >> 6) & 63] : '=';
    out += left > 2 ? BASE64[chunk & 63] : '=';
  }
  return out;
}

export function sign(method: string, url: string, params: [string, string][], creds: OAuth1Credentials): string {
  const key = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.tokenSecret ?? '')}`;
  return toBase64(sha1.hmac.array(key, signatureBaseString(method, url, params)));
}

export type SignOptions = {
  /** Pola formularza `application/x-www-form-urlencoded` — one też wchodzą do podpisu. */
  body?: Record<string, string>;
  nonce?: string;
  timestamp?: number;
};

/**
 * Gotowy nagłówek `Authorization`. Nonce i znacznik czasu da się podać z zewnątrz,
 * żeby test mógł porównać wynik z wektorem z normy.
 */
export function authorizationHeader(
  method: string,
  url: string,
  creds: OAuth1Credentials,
  options: SignOptions = {},
): string {
  const oauth: [string, string][] = [
    ['oauth_consumer_key', creds.consumerKey],
    ['oauth_nonce', options.nonce ?? randomNonce()],
    ['oauth_signature_method', 'HMAC-SHA1'],
    ['oauth_timestamp', String(options.timestamp ?? Math.floor(Date.now() / 1000))],
    ['oauth_version', '1.0'],
  ];
  if (creds.token) oauth.push(['oauth_token', creds.token]);

  const all: [string, string][] = [
    ...oauth,
    ...queryParameters(url),
    ...Object.entries(options.body ?? {}),
  ];
  const signature = sign(method, url, all, creds);

  return `OAuth ${[...oauth, ['oauth_signature', signature] as [string, string]]
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(', ')}`;
}

function randomNonce(): string {
  // Nonce ma być niepowtarzalny w obrębie znacznika czasu — losowość kryptograficzna
  // nic tu nie wnosi, bo wartość jedzie jawnie w nagłówku.
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');
}
