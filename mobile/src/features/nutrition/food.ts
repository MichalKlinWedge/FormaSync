import type { FoodBasis } from '@/db/schema';
import { normalizeText } from '@/features/exercises/filter';
import { formatNumber } from '@/lib/number';

import { formatGrams, formatKcal } from './format';

/**
 * Własna baza produktów: przeliczenia i podpisy.
 *
 * Produkt opisuje się na 100 g albo na porcję. To drugie nie jest wygodnictwem — bez niego nie da
 * się zapisać domowego jedzenia, bo „owsianka z bananem, 420 kcal” jest wiedzą o całej misce,
 * a nie o stu gramach. Liczenie jest w obu przypadkach jedno: ilość przez jednostkę odniesienia.
 */

/** Tyle, ile do przeliczenia potrzeba — wiersz z bazy spełnia ten kształt. */
export type FoodValues = {
  basis: FoodBasis;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type Nutrients = {
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

/** Ilość podaje się w gramach albo w porcjach — zależnie od tego, co produkt opisuje. */
export const AMOUNT_UNITS: Record<FoodBasis, string> = { G100: 'g', SERVING: 'porcji' };

/** Jednostka odniesienia: sto gramów albo jedna porcja. */
export const referenceAmount = (basis: FoodBasis): number => (basis === 'G100' ? 100 : 1);

/**
 * Wartości dla zjedzonej ilości. Mnożnik to ilość przez jednostkę odniesienia: 150 g produktu
 * liczonego na 100 g to półtora raza, i półtorej porcji to też półtora raza.
 *
 * Kalorie zaokrąglamy do jedności, makroskładniki do dziesiątej grama — dokładniej nie ma po co,
 * bo wartości produktu też są przybliżeniem.
 */
export function nutrientsFor(food: FoodValues, amount: number): Nutrients {
  const factor = amount > 0 ? amount / referenceAmount(food.basis) : 0;
  const scale = (value: number | null): number | null =>
    value === null ? null : Math.round(value * factor * 10) / 10;

  return {
    kcal: Math.round(food.kcal * factor),
    proteinG: scale(food.proteinG),
    carbsG: scale(food.carbsG),
    fatG: scale(food.fatG),
  };
}

/** „na 100 g” albo „na porcję (miska)” — podpis pod wartościami produktu. */
export function describeBasis(food: { basis: FoodBasis; servingName: string | null }): string {
  if (food.basis === 'G100') return 'na 100 g';
  return food.servingName === null ? 'na porcję' : `na porcję (${food.servingName})`;
}

/** „370 kcal / 100 g · białko 13 g” — produkt jednym wierszem. */
export function describeFood(
  food: FoodValues & { servingName: string | null; servingGrams: number | null },
): string {
  const unit =
    food.basis === 'G100' ? '100 g' : (food.servingName ?? 'porcja');
  const mass =
    food.basis === 'SERVING' && food.servingGrams !== null ? ` (${formatGrams(food.servingGrams)})` : '';
  const protein = food.proteinG === null ? null : `białko ${formatGrams(food.proteinG)}`;
  return [`${formatKcal(food.kcal)} / ${unit}${mass}`, protein].filter(Boolean).join(' · ');
}

/** „1,5 porcji”, „70 g” — ilość z jednostką właściwą produktowi. */
export function formatAmount(basis: FoodBasis, amount: number): string {
  const decimals = Number.isInteger(amount) ? 0 : 1;
  return basis === 'G100'
    ? `${formatNumber(amount, decimals)} g`
    : `${formatNumber(amount, decimals)} ${amount === 1 ? 'porcja' : 'porcji'}`;
}

/**
 * Czy produkt pasuje do szukanego tekstu. Reguła jest ta sama, co przy szukaniu planów
 * i ćwiczeń — bez wielkości liter, bez polskich znaków, każde słowo zapytania musi wystąpić.
 * Szukanie ma działać wszędzie tak samo, bo inaczej za każdym razem trzeba je sprawdzać od nowa.
 */
export function matchesFood(food: { name: string; brand: string | null }, search: string): boolean {
  const words = normalizeText(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(`${food.name} ${food.brand ?? ''}`);
  return words.every((word) => haystack.includes(word));
}

export type PortionChoice = { name: string; amount: number };

/**
 * Ilości do wyboru: najpierw własne miarki produktu, potem to, co oczywiste. Przy „na porcję”
 * dokładamy pół i dwie, bo tyle się zwykle je; gramów nie dzielimy, bo tam wpisuje się liczbę.
 */
export function portionChoices(
  food: { basis: FoodBasis; servingName: string | null },
  portions: PortionChoice[],
): PortionChoice[] {
  const own = portions.map((portion) => ({
    name: portion.name,
    amount: portion.amount,
  }));
  if (food.basis === 'G100') {
    return [...own, { name: '100 g', amount: 100 }];
  }
  const unit = food.servingName ?? 'porcja';
  return [
    ...own,
    { name: `½ ${unit}`, amount: 0.5 },
    { name: `1 ${unit}`, amount: 1 },
    { name: `2 ${unit}`, amount: 2 },
  ];
}

export type FoodDraft = {
  name: string;
  brand: string | null;
  basis: FoodBasis;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  servingName: string | null;
  servingGrams: number | null;
  portions: PortionChoice[];
};

export class FoodError extends Error {}

export const emptyFoodDraft = (): FoodDraft => ({
  name: '',
  brand: null,
  basis: 'G100',
  kcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  servingName: null,
  servingGrams: null,
  portions: [],
});

/** Produkt bez nazwy albo bez kalorii nie opisuje niczego, więc go nie przyjmujemy. */
export function validateFood(draft: FoodDraft): void {
  if (draft.name.trim() === '') throw new FoodError('Podaj nazwę produktu.');
  if (draft.kcal === null || draft.kcal <= 0) {
    throw new FoodError(
      draft.basis === 'G100' ? 'Podaj kalorie na 100 g.' : 'Podaj kalorie w jednej porcji.',
    );
  }
  for (const portion of draft.portions) {
    if (portion.name.trim() === '') throw new FoodError('Każda miarka potrzebuje nazwy.');
    if (!(portion.amount > 0)) throw new FoodError(`Miarka „${portion.name}” musi być większa od zera.`);
  }
}
