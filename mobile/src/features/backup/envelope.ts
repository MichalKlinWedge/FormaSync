import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

import { base64ToBytes, bytesToBase64 } from '@/lib/base64';
import { randomBytes } from '@/lib/random';

/**
 * Koperta: kopia zapasowa zaszyfrowana hasłem, którego nie zna nikt poza telefonem i
 * użytkownikiem. Serwer przechowuje wyłącznie to — nie potrafi zajrzeć do środka, więc włamanie
 * na niego nie odsłania tętna, wagi ani ciśnienia.
 *
 * Cena jest symetryczna i trzeba ją powiedzieć wprost: **zapomniane hasło to utracone kopie**.
 * Nie ma tu żadnej furtki, bo każda furtka działałaby też dla kogoś obcego.
 */

const APP_MARKER = 'FormaSync';
export const ENVELOPE_VERSION = 1;

/**
 * Liczba obrotów PBKDF2. Hasło użytkownika jest krótkie, więc jedyne, co utrudnia jego zgadywanie,
 * to koszt jednej próby. Tyle obrotów liczy się na telefonie około sekundy — zauważalnie dla nas
 * raz na dobę, dotkliwie dla kogoś, kto próbuje milionów haseł.
 */
export const KDF_ITERATIONS = 210_000;

const SALT_BYTES = 16;
const NONCE_BYTES = 24;
const KEY_BYTES = 32;

export type Envelope = {
  app: typeof APP_MARKER;
  envelope: number;
  createdAt: string;
  device: string;
  kdf: { name: 'pbkdf2-sha256'; iterations: number; salt: string };
  cipher: 'xchacha20poly1305';
  nonce: string;
  data: string;
};

export class EnvelopeFormatError extends Error {}
export class WrongPasswordError extends Error {
  constructor() {
    super('Złe hasło albo uszkodzona kopia — nie udało się jej odczytać.');
  }
}

const deriveKey = (password: string, salt: Uint8Array, iterations: number) =>
  pbkdf2Async(sha256, utf8ToBytes(password), salt, { c: iterations, dkLen: KEY_BYTES });

export async function sealBackup(
  plaintext: string,
  password: string,
  options: { device?: string; now?: string; iterations?: number } = {},
): Promise<Envelope> {
  if (password.length === 0) throw new EnvelopeFormatError('Hasło nie może być puste.');
  const iterations = options.iterations ?? KDF_ITERATIONS;
  // Nowa sól przy każdej kopii: ten sam klucz nigdy nie szyfruje dwóch różnych kopii, więc
  // powtórzenie wektora jednorazowego nie ma jak zaszkodzić.
  const salt = randomBytes(SALT_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const key = await deriveKey(password, salt, iterations);

  return {
    app: APP_MARKER,
    envelope: ENVELOPE_VERSION,
    createdAt: options.now ?? new Date().toISOString(),
    device: options.device ?? '',
    kdf: { name: 'pbkdf2-sha256', iterations, salt: bytesToBase64(salt) },
    cipher: 'xchacha20poly1305',
    nonce: bytesToBase64(nonce),
    data: bytesToBase64(xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(plaintext))),
  };
}

export async function openBackup(envelope: unknown, password: string): Promise<string> {
  const sealed = checkEnvelope(envelope);
  const key = await deriveKey(password, base64ToBytes(sealed.kdf.salt), sealed.kdf.iterations);
  try {
    const plain = xchacha20poly1305(key, base64ToBytes(sealed.nonce)).decrypt(
      base64ToBytes(sealed.data),
    );
    return bytesToUtf8(plain);
  } catch {
    // Szyfr z uwierzytelnieniem nie odróżnia złego hasła od podmienionej treści i dobrze:
    // w obu wypadkach kopii nie wolno użyć.
    throw new WrongPasswordError();
  }
}

/** Sprawdza, czy to koperta FormaSync w znanej postaci. Rzuca czytelnym błędem. */
export function checkEnvelope(value: unknown): Envelope {
  const envelope = value as Partial<Envelope> | null;
  if (!envelope || typeof envelope !== 'object' || envelope.app !== APP_MARKER) {
    throw new EnvelopeFormatError('To nie jest kopia FormaSync.');
  }
  if (envelope.envelope !== ENVELOPE_VERSION) {
    throw new EnvelopeFormatError(
      `Kopia pochodzi z innej wersji aplikacji (format ${String(envelope.envelope)}).`,
    );
  }
  if (envelope.cipher !== 'xchacha20poly1305' || envelope.kdf?.name !== 'pbkdf2-sha256') {
    throw new EnvelopeFormatError('Kopia zaszyfrowana nieznanym sposobem.');
  }
  if (
    typeof envelope.kdf.iterations !== 'number' ||
    !Number.isFinite(envelope.kdf.iterations) ||
    envelope.kdf.iterations < 1
  ) {
    throw new EnvelopeFormatError('Uszkodzony opis szyfrowania kopii.');
  }
  if (typeof envelope.nonce !== 'string' || typeof envelope.data !== 'string') {
    throw new EnvelopeFormatError('Uszkodzona kopia.');
  }
  return envelope as Envelope;
}

/** Czy to w ogóle koperta — do odróżnienia pliku zaszyfrowanego od zwykłej kopii JSON. */
export const looksSealed = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'envelope' in value && 'cipher' in value;
