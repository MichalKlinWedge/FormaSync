/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { base64ToBytes, bytesToBase64 } from '@/lib/base64';

import {
  checkEnvelope,
  EnvelopeFormatError,
  looksSealed,
  openBackup,
  sealBackup,
  WrongPasswordError,
} from '../envelope';

// Obroty KDF zbijamy w testach do minimum: sprawdzamy zachowanie, nie koszt łamania hasła.
const FAST = { iterations: 1 };

describe('koperta', () => {
  it('to, co zamknięte hasłem, otwiera się tym samym hasłem', async () => {
    const sealed = await sealBackup('{"a":1}', 'tajne', FAST);
    await expect(openBackup(sealed, 'tajne')).resolves.toBe('{"a":1}');
  });

  it('złe hasło nie otwiera', async () => {
    const sealed = await sealBackup('{"a":1}', 'tajne', FAST);
    await expect(openBackup(sealed, 'inne')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('podmieniona treść nie otwiera się nawet dobrym hasłem', async () => {
    // Bez uwierzytelnienia dałoby się po cichu przestawić komuś wagę w kopii na serwerze.
    const sealed = await sealBackup('{"a":1}', 'tajne', FAST);
    const bytes = base64ToBytes(sealed.data);
    bytes[0] ^= 1;
    const tampered = { ...sealed, data: bytesToBase64(bytes) };
    await expect(openBackup(tampered, 'tajne')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('polskie znaki wracają nienaruszone', async () => {
    const text = '{"notatka":"Rozgrzewka · 10×100 m, żółć, ćwierć"}';
    const sealed = await sealBackup(text, 'hasło z ogonkami', FAST);
    await expect(openBackup(sealed, 'hasło z ogonkami')).resolves.toBe(text);
  });

  it('dwie kopie tej samej treści wyglądają inaczej', async () => {
    // Powtarzalny szyfrogram zdradzałby, że nic się nie zmieniło — i że sól nie jest losowa.
    const first = await sealBackup('{"a":1}', 'tajne', FAST);
    const second = await sealBackup('{"a":1}', 'tajne', FAST);
    expect(first.kdf.salt).not.toBe(second.kdf.salt);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.data).not.toBe(second.data);
  });

  it('puste hasło to odmowa, a nie kopia bez zamka', async () => {
    await expect(sealBackup('{}', '', FAST)).rejects.toBeInstanceOf(EnvelopeFormatError);
  });
});

describe('checkEnvelope', () => {
  const valid = {
    app: 'FormaSync',
    envelope: 1,
    createdAt: '2026-10-07T00:00:00.000Z',
    device: '',
    kdf: { name: 'pbkdf2-sha256', iterations: 1, salt: 'AAAA' },
    cipher: 'xchacha20poly1305',
    nonce: 'AAAA',
    data: 'AAAA',
  };

  it('przepuszcza poprawną kopertę', () => {
    expect(checkEnvelope(valid)).toBe(valid);
  });

  it.each([
    ['obcy plik', { ...valid, app: 'CośInnego' }],
    ['nowszy format', { ...valid, envelope: 2 }],
    ['nieznany szyfr', { ...valid, cipher: 'aes-cbc' }],
    ['nieznane wyprowadzanie klucza', { ...valid, kdf: { ...valid.kdf, name: 'md5' } }],
    ['bezsensowna liczba obrotów', { ...valid, kdf: { ...valid.kdf, iterations: 0 } }],
    ['brak treści', { ...valid, data: 42 }],
    ['nic', null],
  ])('odrzuca: %s', (_label, value) => {
    expect(() => checkEnvelope(value)).toThrow(EnvelopeFormatError);
  });
});

describe('looksSealed', () => {
  it('odróżnia kopertę od zwykłej kopii', () => {
    expect(looksSealed({ envelope: 1, cipher: 'xchacha20poly1305' })).toBe(true);
    expect(looksSealed({ app: 'FormaSync', version: 1, tables: {} })).toBe(false);
  });
});

describe('dwa sposoby liczenia klucza', () => {
  it('kopia liczona w tle otwiera się tak samo jak liczona na żądanie', async () => {
    // Obie drogi muszą dawać ten sam klucz — inaczej kopia z nocnej wysyłki nie dałaby się
    // odczytać przyciskiem przywracania.
    const sealed = await sealBackup('{"a":1}', 'tajne', { ...FAST, background: true });
    await expect(openBackup(sealed, 'tajne')).resolves.toBe('{"a":1}');
  });
});
