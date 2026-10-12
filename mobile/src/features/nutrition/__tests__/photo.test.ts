/**
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';

import { bytesOf, MAX_PHOTO_BYTES, PhotoError, photoFrom } from '../photo';

// Wybierak zdjęć jest modułem natywnym — w teście interesują nas wyłącznie sprawdzenia wokół niego.
jest.mock('expo-image-picker', () => ({}));

/** Base64 o zadanej długości — treść nie ma znaczenia, liczy się rozmiar. */
const base64 = (bytes: number): string => 'A'.repeat(Math.ceil((bytes * 4) / 3));

describe('photoFrom', () => {
  it('składa zdjęcie do wysłania', () => {
    expect(
      photoFrom({ uri: 'file:///cache/obiad.jpg', base64: 'QUJD', mimeType: 'image/jpeg' }),
    ).toEqual({ uri: 'file:///cache/obiad.jpg', mimeType: 'image/jpeg', data: 'QUJD' });
  });

  it('bez typu przyjmuje JPEG, bo tyle oddaje wybierak', () => {
    expect(photoFrom({ uri: 'file:///a.jpg', base64: 'QUJD' }).mimeType).toBe('image/jpeg');
    expect(photoFrom({ uri: 'file:///a.jpg', base64: 'QUJD', mimeType: 'IMAGE/PNG' }).mimeType).toBe(
      'image/png',
    );
  });

  it('nie wysyła pliku bez treści ani w formacie, którego model nie przyjmie', () => {
    expect(() => photoFrom({ uri: 'file:///a.jpg', base64: null })).toThrow(PhotoError);
    expect(() => photoFrom({ uri: 'file:///a.gif', base64: 'QUJD', mimeType: 'image/gif' })).toThrow(
      /formatu/,
    );
  });

  it('pilnuje rozmiaru, choćby wybierak nie podał wagi pliku', () => {
    const big = { uri: 'file:///a.jpg', base64: base64(MAX_PHOTO_BYTES + 1024), fileSize: null };
    expect(() => photoFrom(big)).toThrow(/za duże/);

    const fine = { uri: 'file:///a.jpg', base64: base64(MAX_PHOTO_BYTES - 1024) };
    expect(photoFrom(fine).data.length).toBeGreaterThan(0);
  });

  it('rozmiar liczy z base64, nie z deklaracji', () => {
    expect(bytesOf('QUJD')).toBe(3);
    expect(bytesOf('')).toBe(0);
  });
});
