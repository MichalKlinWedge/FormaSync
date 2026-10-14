/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { kcalHeadline } from '../format';

/**
 * Nagłówek kalorii. Trzecia liczba pojawia się tylko wtedy, gdy coś wnosi — powtórzona druga
 * byłaby szumem w miejscu, w które patrzy się przez sekundę.
 */

/** W polskim formacie tysiące i jednostkę rozdziela spacja nierozdzielająca. */
const SP = ' ';

describe('kcalHeadline', () => {
  it('bez budżetu pokazuje samo zjedzone', () => {
    expect(kcalHeadline(1200, null, null)).toBe(`1${SP}200${SP}kcal`);
  });

  it('z budżetem pokazuje dwie liczby i jedną jednostkę', () => {
    expect(kcalHeadline(1200, 2400, 2400)).toBe(`1${SP}200 / 2${SP}400${SP}kcal`);
  });

  it('dokłada cel całego dnia, gdy zaplanowany trening go podnosi', () => {
    expect(kcalHeadline(1200, 2400, 2750)).toBe(`1${SP}200 / 2${SP}400 / 2${SP}750${SP}kcal`);
  });

  it('nie powtarza budżetu jako trzeciej liczby', () => {
    expect(kcalHeadline(1200, 2400, 2300)).toBe(`1${SP}200 / 2${SP}400${SP}kcal`);
  });
});
