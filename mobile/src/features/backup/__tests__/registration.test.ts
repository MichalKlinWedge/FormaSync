/**
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';

import { claimHash, startRegistration } from '../registration';

// Moduły sięgają po bazę i bezpieczny magazyn przy wczytaniu; podmiany są wynoszone ponad importy.
jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

describe('claimHash', () => {
  it('zgadza się z haszem policzonym w PHP', async () => {
    // Wartość wzięta z `php -r "echo hash('sha256', str_repeat('ab', 32));"`. Gdyby któraś
    // strona zaczęła haszować bajty zamiast tekstu, rejestracja wyglądałaby na udaną, a telefon
    // nigdy nie odebrałby tokena — i nic by nie powiedziało, gdzie leży rozjazd.
    expect(claimHash('ab'.repeat(32))).toBe(
      '271a413bd339c5709fdceaec41f14f11e9fbfb5042d72d331c65f32b284cd09a',
    );
  });

  it('daje 64 znaki szesnastkowe, czyli kształt, którego żąda serwer', () => {
    expect(claimHash('cokolwiek')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('startRegistration — odmowy przed wyjściem w sieć', () => {
  const address = 'https://serwer.pl/formasync/backup.php';

  // Każdy z tych przypadków musi odpaść na telefonie. Puszczony dalej zostawiałby na serwerze
  // zgłoszenie, którego nikt nie odbierze, i list wysłany nie wiadomo gdzie.
  it.each([
    ['adres bez https', { address: 'http://serwer.pl/backup.php', email: 'ja@przyklad.pl', inviteToken: 'x' }],
    ['e-mail bez małpy', { address, email: 'ja.przyklad.pl', inviteToken: 'x' }],
    ['e-mail bez domeny', { address, email: 'ja@', inviteToken: 'x' }],
    ['e-mail ze spacją', { address, email: 'ja @przyklad.pl', inviteToken: 'x' }],
    ['pusty e-mail', { address, email: '   ', inviteToken: 'x' }],
    ['brak tokena zaproszenia', { address, email: 'ja@przyklad.pl', inviteToken: '  ' }],
  ])('odrzuca: %s', async (_label, args) => {
    await expect(startRegistration(args)).rejects.toThrow();
  });
});
