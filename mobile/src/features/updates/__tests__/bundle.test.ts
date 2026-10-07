/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { type BundleSnapshot, describeBundle } from '../bundle';

const snapshot = (overrides: Partial<BundleSnapshot> = {}): BundleSnapshot => ({
  isEnabled: true,
  isEmbeddedLaunch: false,
  updateId: '01a117e5-f450-71ef-893c-78027a3167d5',
  createdAt: new Date('2026-10-07T19:48:00.000Z'),
  channel: 'preview',
  ...overrides,
});

describe('opis wgranej paczki', () => {
  it('skraca identyfikator od końca, bo prefiks UUIDv7 powtarza się między wydaniami', () => {
    expect(describeBundle(snapshot({ createdAt: new Date(2026, 9, 7, 21, 48) }))).toBe(
      'aktualizacja …7a3167d5, z 7 października 2026, 21:48, kanał preview.',
    );
  });

  it('odróżnia paczkę wbudowaną w build od wgranej z serwera', () => {
    // To jest cały sens znacznika: bez tego nie widać, czy aktualizacja doszła.
    expect(describeBundle(snapshot({ isEmbeddedLaunch: true }))).toMatch(/wbudowana/);
  });

  it('traktuje brak identyfikatora jak paczkę wbudowaną', () => {
    expect(describeBundle(snapshot({ updateId: null }))).toMatch(/wbudowana/);
  });

  it('mówi wprost, że na serwerze deweloperskim nie ma czego sprawdzać', () => {
    expect(describeBundle(snapshot({ isEnabled: false }))).toMatch(/deweloperskiego/);
  });

  it('radzi sobie bez daty i kanału', () => {
    expect(describeBundle(snapshot({ createdAt: null, channel: null }))).toBe(
      'aktualizacja …7a3167d5.',
    );
  });
});
