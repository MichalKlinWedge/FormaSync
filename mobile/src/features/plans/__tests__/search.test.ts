/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { searchPlans } from '../search';

const PLANS = [
  { id: 1, title: 'Interwały 5x1 km', description: 'Odcinki szybciej od tempa startowego.' },
  { id: 2, title: 'Długi 16 km', description: 'Najdłuższa jednostka tygodnia.' },
  {
    id: 3,
    title: 'PPL — Pull siłownia',
    description: 'Dzień 2 z 3 planu Push-Pull-Legs.',
    exercises: ['Martwy ciąg', 'Wiosłowanie sztangą'],
  },
  { id: 4, title: 'Ławeczka skośna', description: null },
];

describe('searchPlans', () => {
  it('puste zapytanie zostawia całą listę', () => {
    expect(searchPlans(PLANS, '   ')).toHaveLength(4);
  });

  it('szuka po fragmencie nazwy', () => {
    expect(searchPlans(PLANS, 'inter').map((plan) => plan.id)).toEqual([1]);
  });

  it('nie przejmuje się wielkością liter ani polskimi znakami', () => {
    // Pisanie „ł” na klawiaturze telefonu to osobny ruch — zapytanie bez niego ma działać.
    expect(searchPlans(PLANS, 'INTERWALY').map((plan) => plan.id)).toEqual([1]);
    expect(searchPlans(PLANS, 'laweczka').map((plan) => plan.id)).toEqual([4]);
    expect(searchPlans(PLANS, 'dlugi').map((plan) => plan.id)).toEqual([2]);
  });

  it('każde słowo musi wystąpić, w dowolnej kolejności', () => {
    expect(searchPlans(PLANS, 'km 16').map((plan) => plan.id)).toEqual([2]);
    expect(searchPlans(PLANS, 'dlugi interwaly')).toEqual([]);
  });

  it('szuka też w opisie', () => {
    // Plany pod cel mają w nazwie sam dystans, a to, czym są, piszą w opisie.
    expect(searchPlans(PLANS, 'push-pull').map((plan) => plan.id)).toEqual([3]);
    expect(searchPlans(PLANS, 'tygodnia').map((plan) => plan.id)).toEqual([2]);
  });

  it('plan bez opisu nie wywraca szukania', () => {
    expect(searchPlans(PLANS, 'skosna').map((plan) => plan.id)).toEqual([4]);
  });

  it('szuka po nazwie ćwiczenia w środku planu', () => {
    // Plan pamięta się różnie: raz po tytule, raz po tym, że „to ten z martwym ciągiem”.
    expect(searchPlans(PLANS, 'martwy ciag').map((plan) => plan.id)).toEqual([3]);
    expect(searchPlans(PLANS, 'wioslowanie').map((plan) => plan.id)).toEqual([3]);
  });

  it('słowa wolno mieszać między nazwą, opisem i ćwiczeniem', () => {
    expect(searchPlans(PLANS, 'pull martwy').map((plan) => plan.id)).toEqual([3]);
  });

  it('plan bez listy ćwiczeń szuka jak dotąd', () => {
    // Ekran terminu podaje plany bez ćwiczeń — ma znajdować po nazwie, a nie nic.
    expect(searchPlans(PLANS, 'interwaly').map((plan) => plan.id)).toEqual([1]);
  });
});
