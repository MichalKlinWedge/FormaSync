import type { MealType } from '@/db/schema';
import { unwrapJson } from '@/lib/json';

import { formatGrams, formatKcal } from './format';
import { MEAL_LABELS } from './meal';

/**
 * Propozycja jedzenia na dziś: co zjeść na śniadanie, przekąski i kolację, żeby zmieścić się
 * w budżecie dnia.
 *
 * Obiadu nie układamy. Nie dlatego, że jest trudniejszy, tylko dlatego, że zwykle nie jest niczyją
 * decyzją — jest taki, jaki jest, i reszta dnia musi się do niego dopasować. Wchodzi więc do
 * rachunku jako liczba: podana, gdy wiadomo, co będzie, a w przeciwnym razie wzięta z tego, ile
 * zwykle wychodzą Twoje obiady.
 *
 * Moduł jest czysty: polecenie i odczyt odpowiedzi, bez sieci i bez bazy, więc da się je sprawdzić
 * testem. Samo zapytanie wysyła ekran przez `askGemini`.
 */

export class MealPlanError extends Error {}

/** Posiłki, które układa model. Obiad zostaje poza — patrz wyżej. */
export const PROPOSED_MEALS: MealType[] = ['BREAKFAST', 'SNACK', 'DINNER'];

/** Granice zdrowego rozsądku — te same, co przy szacowaniu pojedynczego posiłku. */
const MAX_MEAL_KCAL = 3000;
const MAX_MEAL_PROTEIN = 500;
const MAX_ITEM_GRAMS = 2000;
const MAX_ITEMS = 15;
const NAME_LIMIT = 60;
const NOTE_LIMIT = 240;

/** Ile propozycja może się rozjechać z budżetem, zanim o tym powiemy. */
const SLACK_RATIO = 0.15;
const SLACK_FLOOR = 150;

export type ProposedItem = { name: string; grams: number | null };

export type ProposedMeal = {
  meal: MealType;
  title: string;
  items: ProposedItem[];
  kcal: number;
  proteinG: number | null;
  /** Obiad, który podałeś: model go nie wymyślił, tylko oszacował. */
  estimated: boolean;
};

export type MealPlan = {
  meals: ProposedMeal[];
  /** Co model założył; null, gdy nic nie powiedział. */
  note: string | null;
  /** Ostrzeżenie o propozycji, która nie trzyma się budżetu. */
  warning: string | null;
};

export type PlanRequest = {
  /** Kalorie do rozdysponowania na układane posiłki. */
  kcal: number;
  /** Białko, które na te posiłki zostaje; null, gdy nie znamy masy ciała. */
  proteinG: number | null;
  /** Obiad: opis, gdy go znasz, i liczba — podana albo wzięta ze średniej z Twoich obiadów. */
  lunch: { kcal: number; description: string | null };
  /** Wytyczne żywieniowe — czego nie jesz, ile masz czasu. Pusty tekst, gdy nic nie wpisano. */
  guidance: string;
  /** Dzisiejszy trening; null, gdy go nie ma. Model ma wiedzieć, skąd większy budżet. */
  training: string | null;
};

/** Czy obiad jest ustalony. Wtedy model ma go oszacować, a nie wymyślać. */
export const lunchKnown = (request: PlanRequest): boolean =>
  (request.lunch.description ?? '').trim() !== '';

export function buildPlanPrompt(request: PlanRequest): string {
  const known = lunchKnown(request);
  const lines = [
    'Jesteś dietetykiem układającym jeden dzień jedzenia. Masz podać konkretne produkty z gramaturą.',
    '',
    'BUDŻET',
    `- Do rozdysponowania: ${Math.round(request.kcal)} kcal.`,
  ];

  if (request.proteinG !== null) {
    lines.push(`- Białko w tych posiłkach łącznie: co najmniej ${Math.round(request.proteinG)} g.`);
  }

  lines.push(
    known
      ? '- Obiad jest już ustalony i nie podlega zmianie: """'
        + (request.lunch.description ?? '').trim()
        + '""". Oszacuj jego wartość i zwróć go jako posiłek "LUNCH", a pozostałe ułóż tak, żeby'
        + ' suma wszystkich — razem z obiadem — zmieściła się w budżecie.'
      : `- Obiadu nie układasz i nie zwracasz go. Jest już odjęty od budżetu (około`
        + ` ${Math.round(request.lunch.kcal)} kcal).`,
  );

  if (request.training !== null) {
    lines.push(`- Dziś trening: ${request.training}. Stąd większy budżet.`);
  }

  lines.push(
    '',
    'ZASADY',
    '- Odpowiedz samym JSON-em, bez komentarza i bez znaczników kodu.',
    '- Kształt: {"meals": [{"meal": "BREAKFAST" albo "SNACK" albo "DINNER" albo "LUNCH",'
      + ' "title": tekst, "items": [{"name": tekst, "grams": liczba}], "kcal": liczba,'
      + ' "protein": liczba albo null}], "note": tekst albo null}',
    `- Ułóż dokładnie te posiłki: ${PROPOSED_MEALS.map((meal) => MEAL_LABELS[meal]).join(', ')}`
      + `${known ? ', a obiad dołóż jako oszacowany' : ''}.`,
    '- Suma kalorii ze wszystkich zwróconych posiłków ma trafić w budżet z dokładnością do 5%.',
    '- Każdy składnik z gramaturą w gramach, w postaci, w jakiej się go kupuje: "płatki owsiane",'
      + ' a nie "owsianka". Bez przypraw i bez wody.',
    '- "title": krótka nazwa posiłku, po której wiadomo, co to jest.',
    '- "kcal" i "protein": dla całego posiłku, nie na 100 g.',
    '- Zwyczajne polskie jedzenie ze zwykłego sklepu, bez suplementów.',
    '- "note": jedno krótkie polskie zdanie o tym, co założyłeś. Bez porad i bez oceny diety.',
  );

  if (request.guidance.trim() !== '') {
    lines.push(
      '',
      'WYTYCZNE OD UŻYTKOWNIKA — ważniejsze niż typowy układ posiłków',
      '"""',
      request.guidance.trim(),
      '"""',
    );
  }

  return lines.join('\n');
}

const text = (value: unknown, limit: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, limit);
};

/** Liczba z odpowiedzi; przyjmujemy też liczbę w cudzysłowie, bo i takie przychodzą. */
function number(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

const MEAL_KEYS: Record<string, MealType> = {
  BREAKFAST: 'BREAKFAST',
  SNACK: 'SNACK',
  DINNER: 'DINNER',
  LUNCH: 'LUNCH',
};

function parseItems(value: unknown): ProposedItem[] {
  if (!Array.isArray(value)) return [];
  const items: ProposedItem[] = [];

  for (const raw of value.slice(0, MAX_ITEMS)) {
    const row = raw as { name?: unknown; grams?: unknown };
    const name = text(row?.name, NAME_LIMIT);
    if (name === null) continue;
    const grams = number(row?.grams);
    items.push({
      name,
      grams: grams === null || grams <= 0 || grams > MAX_ITEM_GRAMS ? null : Math.round(grams),
    });
  }

  return items;
}

/**
 * Odczyt propozycji. Posiłek bez kalorii albo z wartością nie z tego świata wypada zamiast psuć
 * całość: lepiej pokazać dwa posiłki z trzech niż wpuścić do dziennika jeden z 12 000 kcal.
 */
export function parseMealPlan(reply: string, request: PlanRequest): MealPlan {
  const body = unwrapJson(reply);
  if (body === null) throw new MealPlanError('Model nie zwrócił JSON-a.');

  let parsed: { meals?: unknown; note?: unknown };
  try {
    parsed = JSON.parse(body) as { meals?: unknown; note?: unknown };
  } catch {
    throw new MealPlanError('Odpowiedzi modelu nie da się odczytać jako JSON.');
  }

  const rows = Array.isArray(parsed.meals) ? parsed.meals : [];
  const meals: ProposedMeal[] = [];

  for (const raw of rows) {
    const row = raw as {
      meal?: unknown;
      title?: unknown;
      items?: unknown;
      kcal?: unknown;
      protein?: unknown;
    };

    const meal = typeof row?.meal === 'string' ? MEAL_KEYS[row.meal.trim().toUpperCase()] : undefined;
    if (meal === undefined) continue;

    const kcal = number(row?.kcal);
    if (kcal === null || kcal <= 0 || kcal > MAX_MEAL_KCAL) continue;

    const protein = number(row?.protein);
    meals.push({
      meal,
      title: text(row?.title, NAME_LIMIT) ?? MEAL_LABELS[meal],
      items: parseItems(row?.items),
      kcal: Math.round(kcal),
      proteinG:
        protein === null || protein < 0 || protein > MAX_MEAL_PROTEIN ? null : Math.round(protein),
      // Obiad przyszedł z Twojego opisu — model go oszacował, a nie ułożył.
      estimated: meal === 'LUNCH',
    });
  }

  if (meals.length === 0) throw new MealPlanError('Model nie zaproponował ani jednego posiłku.');

  return { meals, note: text(parsed.note, NOTE_LIMIT), warning: budgetWarning(meals, request) };
}

/**
 * Czy propozycja trzyma się budżetu. Nie poprawiamy jej po cichu: gramatura jest całością, a samo
 * przeskalowanie liczb zrobiłoby z niej fikcję — mówimy więc wprost, o ile się rozjechała.
 */
function budgetWarning(meals: ProposedMeal[], request: PlanRequest): string | null {
  const sum = meals.reduce((total, meal) => total + meal.kcal, 0);
  const slack = Math.max(SLACK_RATIO * request.kcal, SLACK_FLOOR);
  if (Math.abs(sum - request.kcal) <= slack) return null;

  return (
    `Propozycja daje ${formatKcal(sum)}, a do rozdysponowania było ${formatKcal(request.kcal)}.`
    + ' Popraw gramaturę przed wpisaniem albo poproś o nową.'
  );
}

export type BudgetInput = {
  /** Budżet dnia: wzór plus trening, już z celem diety. */
  dayKcal: number;
  /** Kalorie dziś już zapisane w dzienniku. */
  eatenKcal: number;
  eatenProteinG: number;
  proteinTargetG: number | null;
  /**
   * Obiad do odjęcia albo null. Null znaczy „nie ma czego odejmować”: albo obiad jest już
   * w dzienniku i siedzi w `eatenKcal`, albo go opisałeś i wejdzie do samej propozycji.
   * Odjęcie go wtedy drugi raz zrobiłoby z propozycji głodówkę.
   */
  lunch: { kcal: number; proteinG: number | null } | null;
};

/**
 * Ile zostaje na posiłki, które układamy.
 *
 * Zero nie jest błędem: znaczy „na dziś nic już nie zostało”, i wtedy nie ma czego układać.
 */
export function freeBudget(input: BudgetInput): { kcal: number; proteinG: number | null } {
  const lunchKcal = Math.max(0, input.lunch?.kcal ?? 0);
  const kcal = Math.max(0, Math.round(input.dayKcal - input.eatenKcal - lunchKcal));

  if (input.proteinTargetG === null) return { kcal, proteinG: null };

  const lunchProtein = Math.max(0, input.lunch?.proteinG ?? 0);
  const proteinG = Math.max(
    0,
    Math.round(input.proteinTargetG - input.eatenProteinG - lunchProtein),
  );
  return { kcal, proteinG };
}

/**
 * Ile budżetu zjada obiad, gdy nie ma z czego wziąć mediany. Jedna trzecia z okładem — tyle wychodzi
 * obiad w typowym rozkładzie dnia. Liczba jest zgadywaniem i ekran mówi o tym wprost.
 */
export const DEFAULT_LUNCH_SHARE = 0.35;

/** „120 g płatków owsianych · 200 g mleka 2%” — składniki jedną linią pod nazwą posiłku. */
export const describeItems = (items: ProposedItem[]): string =>
  items
    .map((item) => (item.grams === null ? item.name : `${formatGrams(item.grams)} ${item.name}`))
    .join(' · ');

/**
 * Czy ten posiłek z propozycji leży już w dzienniku dnia.
 *
 * Stan przycisku „Zjedzone” bierzemy z dziennika, a nie z pamięci ekranu. Pamięć ekranu znika przy
 * wyjściu i powrocie — a wtedy ten sam posiłek dałoby się zapisać drugi raz i budżet dnia zjadłby
 * go podwójnie. Z dziennika wynika też rzecz odwrotna: skasowanie wpisu znowu odblokowuje przycisk.
 *
 * Dopasowujemy po posiłku i nazwie, bo propozycja bywa w jednym posiłku rozbita na dwie pozycje —
 * sam posiłek odhaczyłby obie naraz.
 */
export function isLogged(
  meal: Pick<ProposedMeal, 'meal' | 'title'>,
  entries: readonly { meal: MealType; title: string }[],
): boolean {
  const title = normalized(meal.title);
  return entries.some((entry) => entry.meal === meal.meal && normalized(entry.title) === title);
}

/** Dziennik zapisuje nazwę obciętą, a wielkość liter nie czyni z posiłku innego posiłku. */
const normalized = (title: string): string => title.trim().toLocaleLowerCase('pl');
