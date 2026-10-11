import { asc, desc, eq, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';

import { type FoodDraft, matchesFood, type PortionChoice, validateFood } from './food';

/** Zapis i odczyt własnej bazy produktów. */

export type Food = typeof schema.foods.$inferSelect;
export type FoodPortion = { id: number; name: string; amount: number };
export type FoodWithPortions = Food & { portions: FoodPortion[] };

/**
 * Produkty do wyboru: najpierw ostatnio jedzone, potem nigdy nieużyte od najnowszego. Baza rośnie
 * z każdym wpisem, więc bez takiej kolejności po miesiącu trzeba by jej szukać po alfabecie.
 */
export function listFoods(db: SyncDb, search = ''): Food[] {
  return db
    .select()
    .from(schema.foods)
    .orderBy(
      sql`${schema.foods.usedAt} is null`,
      desc(schema.foods.usedAt),
      desc(schema.foods.id),
    )
    .all()
    .filter((food) => matchesFood(food, search));
}

export function portionsOf(db: SyncDb, foodId: number): FoodPortion[] {
  return db
    .select({
      id: schema.foodPortions.id,
      name: schema.foodPortions.name,
      amount: schema.foodPortions.amount,
    })
    .from(schema.foodPortions)
    .where(eq(schema.foodPortions.foodId, foodId))
    .orderBy(asc(schema.foodPortions.amount), asc(schema.foodPortions.id))
    .all();
}

export function loadFood(db: SyncDb, id: number): FoodWithPortions | null {
  const food = db.select().from(schema.foods).where(eq(schema.foods.id, id)).get();
  return food === undefined ? null : { ...food, portions: portionsOf(db, id) };
}

/**
 * Produkt po kodzie kreskowym. Szukamy u siebie przed pytaniem bazy w sieci: raz zeskanowany
 * produkt jest już nasz, z naszymi miarkami i naszą poprawką wartości, więc nie ma po co
 * ściągać go drugi raz ani zakładać duplikatu.
 */
export function foodByBarcode(db: SyncDb, barcode: string): FoodWithPortions | null {
  const food = db.select().from(schema.foods).where(eq(schema.foods.barcode, barcode)).get();
  return food === undefined ? null : { ...food, portions: portionsOf(db, food.id) };
}

/** Wersja robocza z zapisanego produktu — do ekranu edycji. */
export function foodDraft(food: FoodWithPortions): FoodDraft {
  return {
    name: food.name,
    brand: food.brand,
    basis: food.basis,
    kcal: food.kcal,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
    servingName: food.servingName,
    servingGrams: food.servingGrams,
    portions: food.portions.map((portion) => ({ name: portion.name, amount: portion.amount })),
  };
}

const trimmed = (value: string | null): string | null => {
  const text = (value ?? '').trim();
  return text === '' ? null : text;
};

/**
 * Zapisuje produkt (nowy lub istniejący) razem z miarkami. Miarki zastępujemy w całości — nic
 * się na nie nie powołuje, a edycja listy wiersz po wierszu byłaby pracą bez powodu.
 */
export function saveFood(
  db: SyncDb,
  draft: FoodDraft,
  options: { id?: number; source?: schema.FoodSource; barcode?: string | null } = {},
): number {
  validateFood(draft);

  const values = {
    name: draft.name.trim(),
    brand: trimmed(draft.brand),
    basis: draft.basis,
    kcal: Math.round(draft.kcal as number),
    proteinG: draft.proteinG,
    carbsG: draft.carbsG,
    fatG: draft.fatG,
    // Nazwa i masa porcji nie mają sensu przy liczeniu na 100 g — nie zostawiamy ich po zmianie.
    servingName: draft.basis === 'SERVING' ? trimmed(draft.servingName) : null,
    servingGrams: draft.basis === 'SERVING' ? draft.servingGrams : null,
  };

  return db.transaction((tx) => {
    let id: number;
    if (options.id === undefined) {
      id = tx
        .insert(schema.foods)
        .values({ ...values, source: options.source ?? 'OWN', barcode: options.barcode ?? null })
        .returning({ id: schema.foods.id })
        .get().id;
    } else {
      id = options.id;
      tx.update(schema.foods).set(values).where(eq(schema.foods.id, id)).run();
      tx.delete(schema.foodPortions).where(eq(schema.foodPortions.foodId, id)).run();
    }

    const portions: PortionChoice[] = draft.portions.map((portion) => ({
      name: portion.name.trim(),
      amount: portion.amount,
    }));
    if (portions.length > 0) {
      tx.insert(schema.foodPortions)
        .values(portions.map((portion) => ({ foodId: id, ...portion })))
        .run();
    }
    return id;
  });
}

/**
 * Usuwa produkt razem z miarkami. Zapisane posiłki zostają z własnymi liczbami — tracą tylko
 * odnośnik, bo historii dnia nie wolno zmienić usunięciem czegoś z bazy.
 */
export function deleteFood(db: SyncDb, id: number): void {
  db.delete(schema.foods).where(eq(schema.foods.id, id)).run();
}

/** Odnotowuje użycie produktu — po tym układa się lista wyboru. */
export function markFoodUsed(db: SyncDb, id: number, now: Date = new Date()): void {
  db.update(schema.foods)
    .set({ usedAt: now.toISOString() })
    .where(eq(schema.foods.id, id))
    .run();
}

/** Ile razy produkt pojawił się w historii dnia — pokazujemy to przed usunięciem. */
export function foodUsage(db: SyncDb, id: number): number {
  return db
    .select({ id: schema.mealLogs.id })
    .from(schema.mealLogs)
    .where(eq(schema.mealLogs.foodId, id))
    .all().length;
}
