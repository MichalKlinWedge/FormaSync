/**
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';

import { shouldBackUpNow } from '../remote-backup';

// Moduł sięga po bazę przy wczytaniu; podmiana jest wynoszona ponad importy.
jest.mock('@/db/client', () => ({ db: {} }));

describe('shouldBackUpNow', () => {
  const now = new Date('2026-10-07T12:00:00.000Z');

  it('bez żadnej kopii — tak', () => {
    expect(shouldBackUpNow(null, now)).toBe(true);
  });

  it('kopia sprzed godziny — jeszcze nie', () => {
    expect(shouldBackUpNow('2026-10-07T11:00:00.000Z', now)).toBe(false);
  });

  it('kopia sprzed doby — tak', () => {
    expect(shouldBackUpNow('2026-10-06T12:00:00.000Z', now)).toBe(true);
  });

  it('data z przyszłości nie blokuje kopii na zawsze', () => {
    // Zegar przestawiony ręcznie zapisałby datę w przyszłości i bez tego warunku
    // aplikacja przestałaby wysyłać kopie, nic o tym nie mówiąc.
    expect(shouldBackUpNow('2027-01-01T00:00:00.000Z', now)).toBe(true);
  });

  it('popsuta data nie blokuje kopii', () => {
    expect(shouldBackUpNow('nie-data', now)).toBe(true);
  });
});
