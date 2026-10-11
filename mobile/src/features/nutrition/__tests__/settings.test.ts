/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { DEFAULT_RATE, PROTEIN_PER_KG } from '../goal';
import {
  DEFAULT_ACTIVITY,
  DEFAULT_MODE,
  nutritionSettingsFrom,
  resolvedProtein,
  resolvedRate,
} from '../settings';

describe('nutritionSettingsFrom', () => {
  it('czyta zapisane wartości', () => {
    expect(
      nutritionSettingsFrom({ activity: 'HIGH', mode: 'REDUCTION', rate: '0.75', protein: '2.2', target: '2600' }),
    ).toEqual({
      activity: 'HIGH',
      mode: 'REDUCTION',
      ratePerWeek: 0.75,
      proteinPerKg: 2.2,
      manualKcal: 2600,
    });
  });

  it('pustka znaczy „domyślne dla trybu”, a nie zero', () => {
    const settings = nutritionSettingsFrom({});
    expect(settings).toEqual({
      activity: DEFAULT_ACTIVITY,
      mode: DEFAULT_MODE,
      ratePerWeek: null,
      proteinPerKg: null,
      manualKcal: null,
    });
    expect(resolvedRate(settings)).toBe(DEFAULT_RATE[DEFAULT_MODE]);
    expect(resolvedProtein(settings)).toBe(PROTEIN_PER_KG[DEFAULT_MODE]);
  });

  it('wartość nie z tego świata wraca do domyślnej', () => {
    const settings = nutritionSettingsFrom({
      activity: 'TELEPORT',
      mode: 'GŁODÓWKA',
      rate: '9',
      protein: '12',
      target: '40',
    });
    expect(settings.activity).toBe(DEFAULT_ACTIVITY);
    expect(settings.mode).toBe(DEFAULT_MODE);
    expect(settings.ratePerWeek).toBeNull();
    expect(settings.proteinPerKg).toBeNull();
    expect(settings.manualKcal).toBeNull();
  });

  it('zmiana trybu przestawia tempo i białko, dopóki nie wpisano ich ręcznie', () => {
    const auto = nutritionSettingsFrom({ mode: 'MASS' });
    expect(resolvedRate(auto)).toBe(DEFAULT_RATE.MASS);
    expect(resolvedProtein(auto)).toBe(PROTEIN_PER_KG.MASS);

    const manual = nutritionSettingsFrom({ mode: 'MASS', rate: '0.1', protein: '2' });
    expect(resolvedRate(manual)).toBe(0.1);
    expect(resolvedProtein(manual)).toBe(2);
  });
});
