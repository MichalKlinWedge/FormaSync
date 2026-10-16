/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { describeLeft } from '../day-record';

/**
 * Zdanie pod wartością dnia. Zdanie „cel dowieziony” przy brakujących 200 ml byłoby kłamstwem,
 * którego na ekranie nikt nie odróżni od prawdy.
 */

const unit = (value: number) => `${value} j.`;

describe('describeLeft', () => {
  it('mówi, ile zabrakło', () => {
    expect(describeLeft(800, unit)).toBe('Zabrakło 800 j..');
  });

  it('mówi, ile poszło ponad cel', () => {
    expect(describeLeft(-310, unit)).toBe('Ponad cel o 310 j..');
  });

  it('dowieziony cel nazywa wprost, bez zaokrąglania na korzyść', () => {
    expect(describeLeft(0, unit)).toBe('Cel dowieziony co do jednostki.');
  });
});
