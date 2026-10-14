/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { median } from '../stats';

describe('median', () => {
  it('bierze środkową wartość, a nie średnią', () => {
    // Średnia z tego to 1167 — jeden wyskok przestawiłby ją o połowę.
    expect(median([700, 800, 2000])).toBe(800);
  });

  it('przy parzystej liczbie uśrednia dwie środkowe', () => {
    expect(median([600, 700, 800, 900])).toBe(750);
  });

  it('nie zależy od kolejności', () => {
    expect(median([2000, 700, 800])).toBe(800);
  });

  it('z pustej listy nie wymyśla liczby', () => {
    expect(median([])).toBeNull();
  });
});
