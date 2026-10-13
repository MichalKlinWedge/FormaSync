/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { setSetting } from '@/db/settings';
import { createTestDb } from '@/db/test-utils';

import { clearProposal, loadProposal, saveProposal } from '../proposal-store';
import type { MealPlan } from '../proposal';

/**
 * Propozycję układa się rano, a czyta wieczorem. Zapis ma zatem przeżyć zamknięcie ekranu — ale
 * nie dzień: wczorajsza kolacja pokazana dziś jako „plan na dziś” byłaby zwykłym kłamstwem.
 */

const plan: MealPlan = {
  meals: [
    {
      meal: 'BREAKFAST',
      title: 'Owsianka',
      items: [{ name: 'płatki owsiane', grams: 80 }],
      kcal: 500,
      proteinG: 20,
      estimated: false,
    },
  ],
  note: 'Porcje typowe.',
  warning: null,
};

describe('proposal-store', () => {
  it('oddaje propozycję zapisaną na ten sam dzień', () => {
    const db = createTestDb();
    saveProposal(db, '2026-10-13', plan);

    expect(loadProposal(db, '2026-10-13')).toEqual(plan);
  });

  it('nie podaje wczorajszej propozycji jako dzisiejszej', () => {
    const db = createTestDb();
    saveProposal(db, '2026-10-12', plan);

    expect(loadProposal(db, '2026-10-13')).toBeNull();
  });

  it('zapis z innej wersji aplikacji traktuje jak brak', () => {
    const db = createTestDb();
    setSetting(db, 'nutrition_proposal', '{"dayKey":"2026-10-13","plan":{"meals":"owsianka"}}');

    expect(loadProposal(db, '2026-10-13')).toBeNull();
  });

  it('po wyczyszczeniu nie zostaje nic', () => {
    const db = createTestDb();
    saveProposal(db, '2026-10-13', plan);
    clearProposal(db);

    expect(loadProposal(db, '2026-10-13')).toBeNull();
  });
});
