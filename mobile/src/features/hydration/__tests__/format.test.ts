/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { mlHeadline } from '../format';

/**
 * Nagłówek dnia. Trzecia liczba pojawia się tylko wtedy, gdy coś wnosi — powtórzona druga byłaby
 * szumem w miejscu, w które patrzy się przez sekundę.
 */

/** Liczbę od jednostki dzieli spacja nierozdzielająca. */
const SP = ' ';

describe('mlHeadline', () => {
  it('bez zaplanowanego treningu pokazuje wypite i cel', () => {
    expect(mlHeadline(800, 2600, 2600)).toBe(`800${SP}ml / 2,6${SP}l`);
  });

  it('z zaplanowanym treningiem dokłada cel całego dnia', () => {
    expect(mlHeadline(800, 2600, 3000)).toBe(`800${SP}ml / 2,6${SP}l / 3${SP}l`);
  });

  it('nie powtarza celu jako trzeciej liczby', () => {
    expect(mlHeadline(800, 2600, 2400)).toBe(`800${SP}ml / 2,6${SP}l`);
  });
});
