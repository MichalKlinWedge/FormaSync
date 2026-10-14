/**
 * Geometria paska kalorii.
 *
 * Pasek mierzy cały dzień razem z zaplanowanym treningiem, bo to on jest celem, do którego dzień
 * dojdzie. Budżet na teraz zostaje w nim granicą: do niej wolno jeść już, za nią leży to, co
 * dopiero trzeba spalić — i dlatego ten odcinek ma inny kolor.
 *
 * Same ułamki, bez kolorów i bez widoku: to jedyna część paska, w której da się pomylić liczby,
 * więc musi dać się ją sprawdzić testem.
 */
export type BudgetBar = {
  /** Jaka część paska jest zjedzona; przycięta do całości, bo pasek nie rośnie poza ramkę. */
  ratio: number;
  /** W którym miejscu kończy się budżet na teraz, a zaczyna zapas za trening. */
  earned: number;
  /** Czy zjedzone przekroczyło budżet na teraz — za to odpowiada kolor wypełnienia. */
  over: boolean;
};

const clamp = (value: number): number => Math.min(Math.max(value, 0), 1);

export function budgetBar(eaten: number, target: number, dayTarget: number | null): BudgetBar {
  const scale = Math.max(dayTarget ?? target, target);
  if (scale <= 0) return { ratio: 0, earned: 1, over: false };

  return {
    ratio: clamp(eaten / scale),
    earned: clamp(target / scale),
    over: eaten > target,
  };
}
