/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { describeCounts } from '../report';

describe('describeCounts', () => {
  it('rozpisuje każdy pomiar osobno, razem z tymi, których nie było', () => {
    // Zero przy jednym pomiarze to sygnał, że odczyt mógł przestać działać — ma być widoczny.
    const text = describeCounts(
      { restingHeartRate: 7, sleep: 0, hrv: 6, pressure: 0, calories: 7 },
      7,
    );
    expect(text).toContain('Tętno spoczynkowe: 7 z 7 dni.');
    expect(text).toContain('Sen: 0 z 7 dni.');
    expect(text).toContain('Ciśnienie: 0 z 7 dni.');
    expect(text.split('\n')).toHaveLength(5);
  });
});
