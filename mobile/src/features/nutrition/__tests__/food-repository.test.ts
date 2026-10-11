/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { createTestDb } from '@/db/test-utils';

import { emptyFoodDraft, type FoodDraft, FoodError } from '../food';
import {
  deleteFood,
  foodDraft,
  foodUsage,
  listFoods,
  loadFood,
  markFoodUsed,
  portionsOf,
  saveFood,
} from '../food-repository';
import { dayMeals, logFoodMeal, logMealAsFood, MealError } from '../repository';

const at = (day: number, hour = 8) => new Date(2026, 9, day, hour);

const bread = (): FoodDraft => ({
  ...emptyFoodDraft(),
  name: 'Chleb żytni',
  brand: 'Piekarnia Zdrój',
  kcal: 250,
  proteinG: 8.5,
  portions: [{ name: 'kromka', amount: 35 }],
});

const oatmeal = (): FoodDraft => ({
  ...emptyFoodDraft(),
  name: 'Owsianka z bananem',
  basis: 'SERVING',
  kcal: 420,
  proteinG: 18,
  servingName: 'miska',
  servingGrams: 350,
});

describe('saveFood', () => {
  it('zapisuje produkt razem z miarkami', () => {
    const db = createTestDb();
    const id = saveFood(db, bread());

    const food = loadFood(db, id)!;
    expect(food).toMatchObject({ name: 'Chleb żytni', brand: 'Piekarnia Zdrój', basis: 'G100', kcal: 250 });
    expect(food.portions).toEqual([{ id: expect.any(Number), name: 'kromka', amount: 35 }]);
    expect(food.source).toBe('OWN');
  });

  it('edycja zastępuje miarki w całości', () => {
    const db = createTestDb();
    const id = saveFood(db, bread());
    saveFood(db, { ...foodDraft(loadFood(db, id)!), portions: [{ name: 'pajda', amount: 60 }] }, { id });

    expect(portionsOf(db, id)).toEqual([{ id: expect.any(Number), name: 'pajda', amount: 60 }]);
  });

  it('po zmianie na liczenie na 100 g nie zostawia nazwy porcji', () => {
    const db = createTestDb();
    const id = saveFood(db, oatmeal());
    saveFood(db, { ...foodDraft(loadFood(db, id)!), basis: 'G100' }, { id });

    expect(loadFood(db, id)).toMatchObject({ basis: 'G100', servingName: null, servingGrams: null });
  });

  it('nie przyjmuje produktu bez nazwy', () => {
    const db = createTestDb();
    expect(() => saveFood(db, { ...bread(), name: ' ' })).toThrow(FoodError);
    expect(listFoods(db)).toHaveLength(0);
  });
});

describe('listFoods', () => {
  it('stawia ostatnio jedzone na początku, nieużyte od najnowszego', () => {
    const db = createTestDb();
    const first = saveFood(db, bread());
    const second = saveFood(db, oatmeal());
    const third = saveFood(db, { ...bread(), name: 'Masło' });

    // Nic jeszcze nie jedzone: od najnowszego.
    expect(listFoods(db).map((food) => food.id)).toEqual([third, second, first]);

    markFoodUsed(db, first, at(11));
    markFoodUsed(db, second, at(12));
    expect(listFoods(db).map((food) => food.id)).toEqual([second, first, third]);
  });

  it('zawęża po nazwie i marce', () => {
    const db = createTestDb();
    saveFood(db, bread());
    saveFood(db, oatmeal());

    expect(listFoods(db, 'zytni').map((food) => food.name)).toEqual(['Chleb żytni']);
    expect(listFoods(db, 'zdroj')).toHaveLength(1);
    expect(listFoods(db, 'banan').map((food) => food.name)).toEqual(['Owsianka z bananem']);
    expect(listFoods(db, 'kotlet')).toHaveLength(0);
  });
});

describe('logFoodMeal', () => {
  it('liczy wpis z produktu i zapisuje masę', () => {
    const db = createTestDb();
    const id = saveFood(db, bread());
    logFoodMeal(db, { meal: 'BREAKFAST', foodId: id, amount: 70 }, at(11, 8));

    const meals = dayMeals(db, '2026-10-11');
    expect(meals[0]).toMatchObject({
      title: 'Chleb żytni',
      foodId: id,
      kcal: 175,
      proteinG: 5.9,
      grams: 70,
    });
    // Użycie podbija produkt na górę listy wyboru.
    expect(loadFood(db, id)!.usedAt).toBe(at(11, 8).toISOString());
  });

  it('przy porcjach przelicza masę tylko wtedy, gdy ją znamy', () => {
    const db = createTestDb();
    const known = saveFood(db, oatmeal());
    const unknown = saveFood(db, { ...oatmeal(), name: 'Zupa u mamy', servingGrams: null });

    logFoodMeal(db, { meal: 'LUNCH', foodId: known, amount: 1.5 }, at(11, 13));
    logFoodMeal(db, { meal: 'DINNER', foodId: unknown, amount: 1 }, at(11, 19));

    const [first, second] = dayMeals(db, '2026-10-11');
    expect(first).toMatchObject({ kcal: 630, proteinG: 27, grams: 525 });
    expect(second).toMatchObject({ kcal: 420, grams: null });
  });

  it('nie zapisuje wpisu bez ilości ani z produktu, którego nie ma', () => {
    const db = createTestDb();
    const id = saveFood(db, bread());
    expect(() => logFoodMeal(db, { meal: 'SNACK', foodId: id, amount: 0 })).toThrow(MealError);
    expect(() => logFoodMeal(db, { meal: 'SNACK', foodId: id + 99, amount: 50 })).toThrow(MealError);
  });
});

describe('logMealAsFood', () => {
  it('wpis z ręki zostaje produktem na porcję', () => {
    const db = createTestDb();
    const { foodId } = logMealAsFood(
      db,
      { meal: 'BREAKFAST', title: 'Jajecznica z trzech jaj', kcal: 330, proteinG: 21, grams: 200 },
      at(11, 9),
    );

    const food = loadFood(db, foodId)!;
    expect(food).toMatchObject({
      name: 'Jajecznica z trzech jaj',
      basis: 'SERVING',
      kcal: 330,
      proteinG: 21,
      servingGrams: 200,
      usedAt: at(11, 9).toISOString(),
    });
    expect(dayMeals(db, '2026-10-11')[0]).toMatchObject({ foodId, kcal: 330 });
  });

  it('nazajutrz ten sam produkt wybiera się z bazy', () => {
    const db = createTestDb();
    const { foodId } = logMealAsFood(
      db,
      { meal: 'BREAKFAST', title: 'Owsianka', kcal: 420, proteinG: 18 },
      at(11, 8),
    );
    logFoodMeal(db, { meal: 'BREAKFAST', foodId, amount: 1 }, at(12, 8));

    expect(dayMeals(db, '2026-10-12')[0]).toMatchObject({ title: 'Owsianka', kcal: 420, proteinG: 18 });
  });
});

describe('deleteFood', () => {
  it('zabiera miarki, a historii dnia nie rusza', () => {
    const db = createTestDb();
    const id = saveFood(db, bread());
    logFoodMeal(db, { meal: 'BREAKFAST', foodId: id, amount: 70 }, at(11, 8));
    expect(foodUsage(db, id)).toBe(1);

    deleteFood(db, id);
    expect(loadFood(db, id)).toBeNull();
    expect(portionsOf(db, id)).toEqual([]);
    // Wpis zostaje z własnymi liczbami — usunięcie produktu nie przepisuje zjedzonego dnia.
    expect(dayMeals(db, '2026-10-11')[0]).toMatchObject({ title: 'Chleb żytni', kcal: 175 });
  });
});
