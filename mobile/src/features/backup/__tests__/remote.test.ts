/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { checkAddress, RemoteBackupError } from '../remote';

describe('checkAddress', () => {
  it('przyjmuje adres skrytki', () => {
    expect(checkAddress('  https://serwer.pl/formasync/backup.php  ')).toBe(
      'https://serwer.pl/formasync/backup.php',
    );
  });

  it('odrzuca http i mówi dlaczego', () => {
    // Token jedzie w nagłówku każdego żądania — po http każdy po drodze może go odczytać.
    expect(() => checkAddress('http://serwer.pl/backup.php')).toThrow(/https/);
  });

  it.each([
    ['pusty', ''],
    ['sam adres bez ścieżki', 'https://serwer.pl'],
    ['bez protokołu', 'serwer.pl/backup.php'],
    ['ftp', 'ftp://serwer.pl/backup.php'],
  ])('odrzuca: %s', (_label, value) => {
    expect(() => checkAddress(value)).toThrow(RemoteBackupError);
  });
});
