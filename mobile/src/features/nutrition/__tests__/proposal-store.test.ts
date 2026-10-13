/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { setSetting } from '@/db/settings';
import { createTestDb } from '@/db/test-utils';

import { clearProposal, loadProposal, proposedDays, saveProposal } from '../proposal-store';
import type { MealPlan } from '../proposal';

/**
 * Propozycje układa się z wyprzedzeniem, a czyta w dniu, którego dotyczą. Zapis ma zatem przeżyć
 * zamknięcie ekranu i trzymać każdy dzień osobno — ale nie ma prawa podać wczorajszej kolacji jako
 * dzisiejszej.
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

  it('trzyma osobną propozycję na każdy zaplanowany dzień', () => {
    const db = createTestDb();
    const thursday: MealPlan = { ...plan, note: 'Dzień z bieganiem.' };
    saveProposal(db, '2026-10-13', plan, '2026-10-13');
    saveProposal(db, '2026-10-16', thursday, '2026-10-13');

    expect(loadProposal(db, '2026-10-13')).toEqual(plan);
    expect(loadProposal(db, '2026-10-16')).toEqual(thursday);
    expect(proposedDays(db)).toEqual(['2026-10-13', '2026-10-16']);
  });

  it('nie podaje propozycji na dzień, dla którego nic nie stoi', () => {
    const db = createTestDb();
    saveProposal(db, '2026-10-13', plan);

    expect(loadProposal(db, '2026-10-14')).toBeNull();
  });

  it('przy zapisie sprząta dni, które już minęły', () => {
    const db = createTestDb();
    saveProposal(db, '2026-10-12', plan, '2026-10-12');
    saveProposal(db, '2026-10-14', plan, '2026-10-13');

    expect(loadProposal(db, '2026-10-12')).toBeNull();
    expect(proposedDays(db)).toEqual(['2026-10-14']);
  });

  it('czyta zapis z pierwszej wersji, w której dzień był tylko jeden', () => {
    const db = createTestDb();
    setSetting(db, 'nutrition_proposal', JSON.stringify({ dayKey: '2026-10-13', plan }));

    expect(loadProposal(db, '2026-10-13')).toEqual(plan);
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
