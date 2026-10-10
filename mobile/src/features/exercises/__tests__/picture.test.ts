/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { isLocalPicture, normalizePictureUrl, PictureUrlError } from '../picture';

describe('normalizePictureUrl', () => {
  it('przyjmuje plik z galerii, bo ten działa offline', () => {
    expect(normalizePictureUrl('file:///data/user/0/app/exercise-images/1.jpg')).toBe(
      'file:///data/user/0/app/exercise-images/1.jpg',
    );
  });

  it('przyjmuje adres z sieci', () => {
    expect(normalizePictureUrl('  https://przyklad.pl/pompki.png ')).toBe('https://przyklad.pl/pompki.png');
  });

  it('puste pole przywraca rysunek poglądowy, zamiast być błędem', () => {
    expect(normalizePictureUrl('')).toBeNull();
    expect(normalizePictureUrl('   ')).toBeNull();
  });

  it('odrzuca to, czego nie da się pokazać', () => {
    expect(() => normalizePictureUrl('przyklad.pl/obrazek.png')).toThrow(PictureUrlError);
    expect(() => normalizePictureUrl('http://przyklad.pl/obrazek.png')).toThrow(PictureUrlError);
  });
});

describe('isLocalPicture', () => {
  it('rozpoznaje obrazek leżący w telefonie', () => {
    // Tylko taki kasujemy przy podmianie — adresu w sieci nie ruszamy.
    expect(isLocalPicture('file:///data/obrazek.jpg')).toBe(true);
    expect(isLocalPicture('https://przyklad.pl/obrazek.jpg')).toBe(false);
    expect(isLocalPicture(null)).toBe(false);
  });
});
