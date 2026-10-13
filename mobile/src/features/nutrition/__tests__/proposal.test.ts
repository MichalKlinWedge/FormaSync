import { describe, expect, it } from '@jest/globals';

import {
  buildPlanPrompt,
  freeBudget,
  MealPlanError,
  parseMealPlan,
  type PlanRequest,
} from '../proposal';

/**
 * Polecenie i odczyt propozycji. Model bywa twórczy także tam, gdzie nikt go o to nie prosił —
 * dlatego sprawdzamy nie to, czy ładnie odpowiada, tylko czy jego odpowiedź da się bezpiecznie
 * wpuścić do dziennika.
 */

const request: PlanRequest = {
  kcal: 1400,
  proteinG: 120,
  lunch: { kcal: 800, description: null },
  guidance: '',
  training: null,
};

const reply = (meals: unknown, note: string | null = null) => JSON.stringify({ meals, note });

const breakfast = {
  meal: 'BREAKFAST',
  title: 'Owsianka z bananem',
  items: [
    { name: 'płatki owsiane', grams: 80 },
    { name: 'mleko 2%', grams: 250 },
  ],
  kcal: 500,
  protein: 20,
};

describe('buildPlanPrompt', () => {
  it('podaje budżet i cel białka', () => {
    const prompt = buildPlanPrompt(request);
    expect(prompt).toContain('1400 kcal');
    expect(prompt).toContain('co najmniej 120 g');
  });

  it('bez opisu obiadu mówi, że obiad jest już odjęty', () => {
    const prompt = buildPlanPrompt(request);
    expect(prompt).toContain('Obiadu nie układasz');
    expect(prompt).toContain('800 kcal');
  });

  it('z opisem obiadu każe go oszacować i zmieścić w budżecie', () => {
    const prompt = buildPlanPrompt({
      ...request,
      lunch: { kcal: 800, description: 'schabowy z ziemniakami' },
    });
    expect(prompt).toContain('schabowy z ziemniakami');
    expect(prompt).toContain('"LUNCH"');
    expect(prompt).not.toContain('Obiadu nie układasz');
  });

  it('przenosi wytyczne i dzisiejszy trening', () => {
    const prompt = buildPlanPrompt({
      ...request,
      guidance: 'nie jem ryb',
      training: 'siła, około 60 min',
    });
    expect(prompt).toContain('nie jem ryb');
    expect(prompt).toContain('siła, około 60 min');
  });
});

describe('parseMealPlan', () => {
  it('czyta posiłki razem ze składnikami i gramaturą', () => {
    const plan = parseMealPlan(
      reply([breakfast, { ...breakfast, meal: 'SNACK', kcal: 300 }, { ...breakfast, meal: 'DINNER', kcal: 600 }]),
      request,
    );

    expect(plan.meals).toHaveLength(3);
    expect(plan.meals[0]).toMatchObject({ meal: 'BREAKFAST', kcal: 500, proteinG: 20 });
    expect(plan.meals[0].items[1]).toEqual({ name: 'mleko 2%', grams: 250 });
    expect(plan.warning).toBeNull();
  });

  it('odrzuca posiłek nie z tego świata, a resztę zostawia', () => {
    const plan = parseMealPlan(
      reply([breakfast, { ...breakfast, meal: 'DINNER', kcal: 12000 }]),
      request,
    );

    expect(plan.meals.map((meal) => meal.meal)).toEqual(['BREAKFAST']);
  });

  it('obiad z odpowiedzi jest oznaczony jako oszacowany, bo go nie układaliśmy', () => {
    const plan = parseMealPlan(reply([{ ...breakfast, meal: 'LUNCH', kcal: 800 }]), {
      ...request,
      lunch: { kcal: 800, description: 'schabowy' },
      kcal: 800,
    });

    expect(plan.meals[0]).toMatchObject({ meal: 'LUNCH', estimated: true });
  });

  it('mówi, gdy propozycja nie trzyma się budżetu, zamiast ją po cichu przeskalować', () => {
    const plan = parseMealPlan(reply([{ ...breakfast, kcal: 2400 }]), request);

    // Twarda spacja rozdziela i tysiące, i jednostkę — jak wszędzie w aplikacji; stąd \s.
    expect(plan.warning).toMatch(/2\s400\skcal/);
    expect(plan.warning).toMatch(/1\s400\skcal/);
    expect(plan.meals[0].kcal).toBe(2400);
  });

  it('przyjmuje liczbę w cudzysłowie, bo i takie przychodzą', () => {
    const plan = parseMealPlan(reply([{ ...breakfast, kcal: '1400', protein: '120' }]), request);

    expect(plan.meals[0]).toMatchObject({ kcal: 1400, proteinG: 120 });
  });

  it('pustą listę posiłków traktuje jak brak odpowiedzi', () => {
    expect(() => parseMealPlan(reply([]), request)).toThrow(MealPlanError);
    expect(() => parseMealPlan('bez JSON-a', request)).toThrow(MealPlanError);
  });
});

describe('freeBudget', () => {
  const base = { dayKcal: 2600, eatenKcal: 0, eatenProteinG: 0, proteinTargetG: 160 };

  it('odejmuje obiad, którego jeszcze nie ma', () => {
    const free = freeBudget({ ...base, lunch: { kcal: 800, proteinG: 40 } });

    expect(free.kcal).toBe(1800);
    expect(free.proteinG).toBe(120);
  });

  it('nie odejmuje obiadu drugi raz, gdy jest już w dzienniku', () => {
    const free = freeBudget({ ...base, eatenKcal: 800, eatenProteinG: 40, lunch: null });

    expect(free.kcal).toBe(1800);
    expect(free.proteinG).toBe(120);
  });

  it('nie schodzi poniżej zera, gdy dzień jest już przejedzony', () => {
    const free = freeBudget({ ...base, eatenKcal: 3000, eatenProteinG: 200, lunch: null });

    expect(free.kcal).toBe(0);
    expect(free.proteinG).toBe(0);
  });

  it('bez masy ciała nie wymyśla celu białka', () => {
    const free = freeBudget({ ...base, proteinTargetG: null, lunch: null });

    expect(free.proteinG).toBeNull();
  });
});
