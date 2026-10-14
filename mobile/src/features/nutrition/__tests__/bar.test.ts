/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { budgetBar } from '../bar';

/**
 * Pasek kalorii w ułamkach. Na telefonie widać tylko dwa kolorowe pola, więc pomyłka w skali
 * wygląda jak prawda — tu sprawdzamy, że granica budżetu leży tam, gdzie powinna.
 */

describe('budgetBar', () => {
  it('bez zaplanowanego treningu mierzy sam budżet', () => {
    const bar = budgetBar(1200, 2400, 2400);

    expect(bar.ratio).toBeCloseTo(0.5);
    expect(bar.earned).toBe(1);
    expect(bar.over).toBe(false);
  });

  it('zaplanowany trening rozciąga pasek, a budżet zostaje granicą', () => {
    const bar = budgetBar(1200, 2400, 3000);

    // Zjedzone liczy się do całego dnia, nie do samego budżetu.
    expect(bar.ratio).toBeCloseTo(0.4);
    expect(bar.earned).toBeCloseTo(0.8);
  });

  it('przekroczony budżet zgłasza, choć w celu dnia jeszcze się mieści', () => {
    const bar = budgetBar(2600, 2400, 3000);

    expect(bar.over).toBe(true);
    expect(bar.ratio).toBeLessThan(1);
  });

  it('nie wychodzi poza ramkę, choćby zjedzone przebiło cel dnia', () => {
    expect(budgetBar(4000, 2400, 3000).ratio).toBe(1);
  });

  it('bez celu dnia mierzy samym budżetem', () => {
    expect(budgetBar(1200, 2400, null).earned).toBe(1);
  });

  it('zerowego budżetu nie dzieli', () => {
    expect(budgetBar(500, 0, 0)).toEqual({ ratio: 0, earned: 1, over: false });
  });
});
