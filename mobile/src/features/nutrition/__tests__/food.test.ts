/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  amountPrefix,
  describeBasis,
  describeFood,
  emptyFoodDraft,
  FoodError,
  formatAmount,
  matchesFood,
  nutrientsFor,
  portionChoices,
  validateFood,
} from '../food';

const NBSP = ' ';

const bread = { basis: 'G100' as const, kcal: 250, proteinG: 8.5, carbsG: 48, fatG: 1.2 };
const oatmeal = { basis: 'SERVING' as const, kcal: 420, proteinG: 18, carbsG: 60, fatG: 9 };

describe('nutrientsFor', () => {
  it('skaluje wartości na 100 g przez zjedzone gramy', () => {
    // 8,5 g białka na 70 g to 5,95 — zaokrąglenie do dziesiątej grama wystarcza na jedzenie.
    expect(nutrientsFor(bread, 70)).toEqual({ kcal: 175, proteinG: 5.9, carbsG: 33.6, fatG: 0.8 });
    expect(nutrientsFor(bread, 100)).toEqual({ kcal: 250, proteinG: 8.5, carbsG: 48, fatG: 1.2 });
  });

  it('porcje liczy wprost: półtorej porcji to półtora raza', () => {
    expect(nutrientsFor(oatmeal, 1)).toEqual({ kcal: 420, proteinG: 18, carbsG: 60, fatG: 9 });
    expect(nutrientsFor(oatmeal, 1.5)).toEqual({ kcal: 630, proteinG: 27, carbsG: 90, fatG: 13.5 });
  });

  it('brak makroskładnika zostaje brakiem, a nie zerem', () => {
    expect(nutrientsFor({ ...bread, proteinG: null }, 50).proteinG).toBeNull();
  });

  it('ilość zerowa albo ujemna daje zero, nie liczbę ujemną', () => {
    expect(nutrientsFor(bread, 0)).toMatchObject({ kcal: 0, proteinG: 0 });
    expect(nutrientsFor(bread, -50)).toMatchObject({ kcal: 0 });
  });
});

describe('podpisy produktu', () => {
  it('mówią, czego dotyczą liczby', () => {
    expect(describeBasis({ basis: 'G100', servingName: null })).toBe('na 100 g');
    expect(describeBasis({ basis: 'SERVING', servingName: null })).toBe('na porcję');
    expect(describeBasis({ basis: 'SERVING', servingName: 'miska' })).toBe('na porcję (miska)');
  });

  it('składają produkt w jeden wiersz', () => {
    expect(describeFood({ ...bread, servingName: null, servingGrams: null })).toBe(
      `250${NBSP}kcal / 100 g · białko 9${NBSP}g`,
    );
    expect(describeFood({ ...oatmeal, servingName: 'miska', servingGrams: 350 })).toBe(
      `420${NBSP}kcal / miska (350${NBSP}g) · białko 18${NBSP}g`,
    );
  });

  it('odmieniają porcje po liczbie', () => {
    expect(formatAmount('G100', 70)).toBe('70 g');
    expect(formatAmount('SERVING', 1)).toBe('1 porcja');
    expect(formatAmount('SERVING', 1.5)).toBe('1,5 porcji');
  });
});

describe('amountPrefix', () => {
  it('mnożnik przy więcej niż jednej porcji', () => {
    expect(amountPrefix({ amount: 2, basis: 'SERVING' })).toBe(`2 × `);
    expect(amountPrefix({ amount: 1.5, basis: 'SERVING' })).toBe(`1,5 × `);
    expect(amountPrefix({ amount: 0.5, basis: 'SERVING' })).toBe(`0,5 × `);
  });

  it('jedna porcja i gramy obywają się bez mnożnika', () => {
    expect(amountPrefix({ amount: 1, basis: 'SERVING' })).toBe('');
    // Przy liczeniu na 100 g ilość jest masą i stoi w wierszu z wartościami.
    expect(amountPrefix({ amount: 70, basis: 'G100' })).toBe('');
    // Wpisy z ręki i wiersze sprzed tej zmiany nie mają zapisanej ilości.
    expect(amountPrefix({ amount: null, basis: null })).toBe('');
    expect(amountPrefix({ amount: 0, basis: 'SERVING' })).toBe('');
  });
});

describe('matchesFood', () => {
  const food = { name: 'Chleb żytni razowy', brand: 'Piekarnia Zdrój' };

  it('szuka bez wielkości liter i bez polskich znaków', () => {
    expect(matchesFood(food, 'zytni')).toBe(true);
    expect(matchesFood(food, 'CHLEB')).toBe(true);
  });

  it('wymaga każdego słowa zapytania', () => {
    expect(matchesFood(food, 'chleb razowy')).toBe(true);
    expect(matchesFood(food, 'chleb pszenny')).toBe(false);
  });

  it('szuka też w marce, a puste zapytanie przepuszcza wszystko', () => {
    expect(matchesFood(food, 'zdroj')).toBe(true);
    expect(matchesFood(food, '   ')).toBe(true);
  });
});

describe('portionChoices', () => {
  it('przy gramach dokłada setkę do własnych miarek', () => {
    const choices = portionChoices({ basis: 'G100', servingName: null }, [{ name: 'kromka', amount: 35 }]);
    expect(choices).toEqual([
      { name: 'kromka', amount: 35 },
      { name: '100 g', amount: 100 },
    ]);
  });

  it('przy porcjach dokłada pół, jedną i dwie, nazwane jak porcja', () => {
    const choices = portionChoices({ basis: 'SERVING', servingName: 'miska' }, []);
    expect(choices.map((choice) => choice.amount)).toEqual([0.5, 1, 2]);
    expect(choices[1].name).toBe('1 miska');
  });
});

describe('validateFood', () => {
  const draft = { ...emptyFoodDraft(), name: 'Chleb', kcal: 250 };

  it('przepuszcza produkt z nazwą i kaloriami', () => {
    expect(() => validateFood(draft)).not.toThrow();
  });

  it('nie przyjmuje produktu bez nazwy ani bez kalorii', () => {
    expect(() => validateFood({ ...draft, name: '  ' })).toThrow(FoodError);
    expect(() => validateFood({ ...draft, kcal: null })).toThrow(FoodError);
    expect(() => validateFood({ ...draft, kcal: 0 })).toThrow(FoodError);
  });

  it('nie przyjmuje miarki bez nazwy ani bez ilości', () => {
    expect(() => validateFood({ ...draft, portions: [{ name: '', amount: 35 }] })).toThrow(FoodError);
    expect(() => validateFood({ ...draft, portions: [{ name: 'kromka', amount: 0 }] })).toThrow(FoodError);
  });
});
