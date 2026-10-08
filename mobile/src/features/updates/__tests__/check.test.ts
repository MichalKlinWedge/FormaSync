/**
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';

import { describeCheck, fetchNewerBundle, type UpdateApi } from '../check';

function fakeUpdates(overrides: Partial<UpdateApi> = {}): UpdateApi {
  return {
    isEnabled: true,
    checkForUpdateAsync: jest.fn(async () => ({ isAvailable: true })),
    fetchUpdateAsync: jest.fn(async () => ({ isNew: true })),
    ...overrides,
  };
}

describe('fetchNewerBundle', () => {
  it('pobiera nowszą paczkę i zgłasza gotowość do restartu', async () => {
    const updates = fakeUpdates();
    expect(await fetchNewerBundle(updates)).toEqual({ state: 'ready' });
    expect(updates.fetchUpdateAsync).toHaveBeenCalled();
  });

  it('nie pobiera niczego, gdy serwer nie ma nowszej paczki', async () => {
    const updates = fakeUpdates({ checkForUpdateAsync: jest.fn(async () => ({ isAvailable: false })) });
    expect(await fetchNewerBundle(updates)).toEqual({ state: 'current' });
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it('nie obiecuje restartu, gdy pobranie nie przyniosło nowej paczki', async () => {
    const updates = fakeUpdates({ fetchUpdateAsync: jest.fn(async () => ({ isNew: false })) });
    expect(await fetchNewerBundle(updates)).toEqual({ state: 'current' });
  });

  it('nie rusza serwera przy wyłączonych aktualizacjach', async () => {
    const updates = fakeUpdates({ isEnabled: false });
    expect(await fetchNewerBundle(updates)).toEqual({ state: 'disabled' });
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('zwraca powód zamiast wyjątku, gdy sprawdzenie padnie', async () => {
    const updates = fakeUpdates({
      checkForUpdateAsync: jest.fn(async () => {
        throw new Error('brak połączenia');
      }),
    });
    expect(await fetchNewerBundle(updates)).toEqual({ state: 'failed', reason: 'brak połączenia' });
  });
});

describe('describeCheck', () => {
  it('nazywa po imieniu każdy wynik', () => {
    expect(describeCheck({ state: 'ready' }).title).toBe('Pobrano nową wersję');
    expect(describeCheck({ state: 'current' }).title).toBe('Masz najnowszą wersję');
    expect(describeCheck({ state: 'failed', reason: 'timeout' }).message).toBe('timeout');
  });
});
