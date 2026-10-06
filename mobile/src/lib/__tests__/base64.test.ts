/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { Base64Error, base64ToBytes, bytesToBase64 } from '../base64';

const bytes = (...values: number[]) => Uint8Array.from(values);

describe('base64', () => {
  it.each([
    [[], ''],
    [[0], 'AA=='],
    [[0, 0], 'AAA='],
    [[0, 0, 0], 'AAAA'],
    [[255, 255, 255], '////'],
    [[77, 97, 110], 'TWFu'],
  ])('%j koduje się jako %s', (input, expected) => {
    expect(bytesToBase64(bytes(...input))).toBe(expected);
  });

  it('każdy bajt wraca taki sam', () => {
    const all = Uint8Array.from({ length: 256 }, (_v, i) => i);
    expect(Array.from(base64ToBytes(bytesToBase64(all)))).toEqual(Array.from(all));
  });

  it('zgadza się z implementacją Node', () => {
    // Serwer i narzędzia będą czytać to samo zwykłym base64 — własna implementacja nie może
    // różnić się ani o bajt.
    const data = Uint8Array.from({ length: 300 }, (_v, i) => (i * 37) % 256);
    expect(bytesToBase64(data)).toBe(Buffer.from(data).toString('base64'));
  });

  it('dekoduje to, co zakodował Node', () => {
    const text = Buffer.from('Rozgrzewka · 10×100 m', 'utf8').toString('base64');
    expect(Buffer.from(base64ToBytes(text)).toString('utf8')).toBe('Rozgrzewka · 10×100 m');
  });

  it('śmieci odrzuca, zamiast zwracać przypadkowe bajty', () => {
    expect(() => base64ToBytes('nie-base64!')).toThrow(Base64Error);
  });
});
