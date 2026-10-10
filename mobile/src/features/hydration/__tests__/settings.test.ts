/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { createTestDb } from '@/db/test-utils';

import { DEFAULT_PORTIONS_ML, DEFAULT_WINDOW } from '../day';
import { hydrationSettingsFrom, loadHydrationSettings, saveHydrationSettings } from '../settings';

describe('hydrationSettingsFrom', () => {
  it('bez zapisanych wartości daje domyślne', () => {
    expect(hydrationSettingsFrom({})).toEqual({
      manualMl: null,
      window: DEFAULT_WINDOW,
      everyMinutes: 90,
      reminders: true,
      portions: DEFAULT_PORTIONS_ML,
    });
  });

  it('czyta zapisane wartości', () => {
    expect(
      hydrationSettingsFrom({
        target: '2500',
        from: '07:00',
        to: '22:30',
        every: '120',
        reminders: 'off',
        portions: '200 400',
      }),
    ).toEqual({
      manualMl: 2500,
      window: { from: '07:00', to: '22:30' },
      everyMinutes: 120,
      reminders: false,
      portions: [200, 400],
    });
  });

  it('okno, które się domyka, zamienia na domyślne', () => {
    // Inaczej kreska dnia byłaby nie do policzenia i nic nigdy nie przypomniałoby.
    expect(hydrationSettingsFrom({ from: '21:00', to: '08:00' }).window).toEqual(DEFAULT_WINDOW);
  });

  it('wartości nie z tego świata zamienia na domyślne, a nie na błąd', () => {
    const settings = hydrationSettingsFrom({
      target: 'dużo',
      from: '99:99',
      every: '7',
      portions: 'szklanka',
    });
    expect(settings).toMatchObject({
      manualMl: null,
      window: DEFAULT_WINDOW,
      everyMinutes: 90,
      portions: DEFAULT_PORTIONS_ML,
    });
  });

  it('odrzuca porcje poza rozsądnym zakresem', () => {
    expect(hydrationSettingsFrom({ portions: '10 500 9000' }).portions).toEqual([500]);
  });

  it('pilnowanie jest włączone, dopóki nie zostanie wyłączone', () => {
    expect(hydrationSettingsFrom({ reminders: null }).reminders).toBe(true);
    expect(hydrationSettingsFrom({ reminders: 'on' }).reminders).toBe(true);
    expect(hydrationSettingsFrom({ reminders: 'off' }).reminders).toBe(false);
  });
});

describe('zapis ustawień', () => {
  it('wraca z bazy w tej samej postaci', () => {
    const db = createTestDb({ seed: true });
    saveHydrationSettings(db, {
      manualMl: 3000,
      window: { from: '06:00', to: '20:00' },
      everyMinutes: 60,
      reminders: false,
      portions: [300, 600],
    });

    expect(loadHydrationSettings(db)).toEqual({
      manualMl: 3000,
      window: { from: '06:00', to: '20:00' },
      everyMinutes: 60,
      reminders: false,
      portions: [300, 600],
    });
  });

  it('zmienia tylko to, co podane', () => {
    const db = createTestDb({ seed: true });
    saveHydrationSettings(db, { manualMl: 3000 });
    saveHydrationSettings(db, { everyMinutes: 120 });

    expect(loadHydrationSettings(db)).toMatchObject({ manualMl: 3000, everyMinutes: 120 });
  });

  it('czyści stały cel, wracając do liczenia z masy ciała', () => {
    const db = createTestDb({ seed: true });
    saveHydrationSettings(db, { manualMl: 3000 });
    saveHydrationSettings(db, { manualMl: null });

    expect(loadHydrationSettings(db).manualMl).toBeNull();
  });
});
