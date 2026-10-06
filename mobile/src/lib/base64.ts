/**
 * Base64 bez zależności od środowiska. `btoa`/`atob` w React Native radzą sobie tylko ze
 * znakami poniżej 256, a my kodujemy bajty — własna implementacja omija całą tę pułapkę
 * i działa tak samo w testach pod Node i na telefonie.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const REVERSE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const left = bytes.length - i;
    const triple = (bytes[i] << 16) | ((left > 1 ? bytes[i + 1] : 0) << 8) | (left > 2 ? bytes[i + 2] : 0);
    out += ALPHABET[(triple >> 18) & 63] + ALPHABET[(triple >> 12) & 63];
    out += left > 1 ? ALPHABET[(triple >> 6) & 63] : '=';
    out += left > 2 ? ALPHABET[triple & 63] : '=';
  }
  return out;
}

export class Base64Error extends Error {}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[\s=]+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let written = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? REVERSE[code] : -1;
    if (value < 0) throw new Base64Error('To nie jest poprawny base64.');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[written] = (buffer >> bits) & 255;
      written += 1;
    }
  }
  return bytes.subarray(0, written);
}
