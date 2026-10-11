/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { CHECK_COOLDOWN_MS, shouldCheck, type UpdateStatus, updateBadge } from '../badge';

function status(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    isEnabled: true,
    isUpdateAvailable: false,
    isUpdatePending: false,
    isDownloading: false,
    isRestarting: false,
    ...overrides,
  };
}

describe('updateBadge', () => {
  it('bez nowej wersji nie pokazuje niczego', () => {
    expect(updateBadge(status())).toBe('HIDDEN');
  });

  it('milczy przy wyłączonych aktualizacjach, choćby serwer coś miał', () => {
    // Serwer deweloperski: `isEnabled` jest fałszem, a reszta stanu nic nie znaczy.
    expect(updateBadge(status({ isEnabled: false, isUpdateAvailable: true, isUpdatePending: true }))).toBe(
      'HIDDEN',
    );
  });

  it('nowsza paczka na serwerze zapala ikonę do pobrania', () => {
    expect(updateBadge(status({ isUpdateAvailable: true }))).toBe('AVAILABLE');
  });

  it('pobrana paczka ma pierwszeństwo — zostaje ją uruchomić', () => {
    expect(updateBadge(status({ isUpdateAvailable: true, isUpdatePending: true }))).toBe('READY');
  });

  it('pobieranie i restart pokazuje jako robotę w toku', () => {
    expect(updateBadge(status({ isUpdateAvailable: true, isDownloading: true }))).toBe('WORKING');
    expect(updateBadge(status({ isUpdatePending: true, isRestarting: true }))).toBe('WORKING');
  });
});

describe('shouldCheck', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');

  it('pyta, gdy jeszcze nie pytaliśmy', () => {
    expect(shouldCheck(undefined, now)).toBe(true);
  });

  it('nie pyta drugi raz w ciągu kwadransa', () => {
    expect(shouldCheck(new Date(now - 60_000), now)).toBe(false);
    expect(shouldCheck(new Date(now - CHECK_COOLDOWN_MS + 1), now)).toBe(false);
  });

  it('po kwadransie pyta znowu', () => {
    expect(shouldCheck(new Date(now - CHECK_COOLDOWN_MS), now)).toBe(true);
    expect(shouldCheck(new Date(now - 24 * 60 * 60 * 1000), now)).toBe(true);
  });
});
