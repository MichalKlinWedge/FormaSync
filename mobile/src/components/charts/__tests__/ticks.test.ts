/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { niceTicks } from '../ticks';

/**
 * Wartości linii pomocniczych. Na telefonie widać tylko kreski, więc pomyłka tutaj wygląda jak
 * prawda — a to po nich odmierza się wszystko, czego wykres nie podpisuje.
 */

describe('niceTicks', () => {
  it('stawia linie na okrągłych wartościach, nie na krawędziach zakresu', () => {
    // Waga 72–78 kg z zapasem: krok co 2 kg czyta się w pamięci, „73,4” nie.
    expect(niceTicks(71.4, 78.6, 5)).toEqual([72, 74, 76, 78]);
  });

  it('skaluje krok do zakresu', () => {
    // Ciśnienie skurczowe i rozkurczowe na jednej osi — zakres szeroki, krok większy.
    expect(niceTicks(58, 142, 5)).toEqual([60, 80, 100, 120, 140]);
  });

  it('bierze krok dający najbliżej tylu linii, ile poproszono', () => {
    expect(niceTicks(0, 10, 3)).toHaveLength(3);
    expect(niceTicks(0, 10, 6)).toHaveLength(6);
  });

  it('przy remisie woli mniej linii niż gęstwinę', () => {
    // 0–10 przy trzech liniach: krok 5 daje 3, krok 2,5 daje 5 — wygrywa większy.
    expect(niceTicks(0, 10, 3)).toEqual([0, 5, 10]);
  });

  it('radzi sobie z wartościami ułamkowymi, bez ogonów zmiennoprzecinkowych', () => {
    expect(niceTicks(0.05, 0.35, 4)).toEqual([0.1, 0.2, 0.3]);
  });

  it('zakres bez okrągłej wartości oddaje pusto, zamiast zmyślać', () => {
    expect(niceTicks(5, 5, 4)).toEqual([]);
    expect(niceTicks(10, 1, 4)).toEqual([]);
  });

  it('nie wychodzi poza zakres', () => {
    const ticks = niceTicks(123, 456, 5);

    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(123);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(456);
  });
});
