import { describe, expect, it } from '@jest/globals';

import { restCue } from '../rest-sound';

describe('sygnały odliczania przerwy', () => {
  it('dziesiąta sekunda to dzwonek, a nie piknięcie', () => {
    expect(restCue(10)).toBe('warning');
  });

  it('ostatnie pięć sekund pika', () => {
    expect([5, 4, 3, 2, 1].map(restCue)).toEqual(Array(5).fill('tick'));
  });

  it('między dzwonkiem a odliczaniem jest cisza', () => {
    // Pikanie przez całe dziesięć sekund byłoby już nie sygnałem, tylko hałasem.
    expect([9, 8, 7, 6].map(restCue)).toEqual([null, null, null, null]);
  });

  it('dalekie i zerowe sekundy milczą', () => {
    expect(restCue(60)).toBeNull();
    expect(restCue(11)).toBeNull();
    expect(restCue(0)).toBeNull();
  });
});
