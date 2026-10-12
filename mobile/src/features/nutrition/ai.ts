import type { FoodBasis } from '@/db/schema';
import { unwrapJson } from '@/lib/json';

import { emptyFoodDraft, type FoodDraft } from './food';

/**
 * Oszacowanie wartości posiłku z opisu słowami.
 *
 * To najsłabsze ogniwo całego liczenia i trzeba to powiedzieć wprost: model nie waży jedzenia,
 * tylko zgaduje typowe wielkości. Dlatego jego odpowiedź nie trafia nigdzie sama — wraca jako
 * wersja robocza produktu, do poprawienia przed zapisem, a obok niej stoi zdanie o tym, co model
 * założył.
 *
 * Moduł jest czysty: polecenie i odczyt odpowiedzi bez sieci i bez bazy, więc da się je sprawdzić
 * testem. Samo zapytanie wysyła ekran przez `askGemini`.
 */

export class FoodReplyError extends Error {}

/** Granice zdrowego rozsądku. Czysty tłuszcz to 900 kcal na 100 g i nic więcej nią nie będzie. */
const MAX_KCAL_PER_100G = 900;
const MAX_KCAL_PER_SERVING = 5000;
const MAX_GRAMS = 5000;
const MAX_MACRO_PER_100G = 100;
const NAME_LIMIT = 80;
const NOTE_LIMIT = 240;

export type PromptOptions = {
  /** Czy do zapytania idzie zdjęcie — wtedy model dostaje osobne zasady, jak je czytać. */
  photo?: boolean;
};

export function buildFoodPrompt(description: string, options: PromptOptions = {}): string {
  const photoRules = options.photo
    ? [
        '- Na zdjęciu jest to samo jedzenie. Po nim rozpoznaj składniki; opis mówi o ilości.',
        '- Wielkość porcji oceniaj po tym, co widać obok jedzenia: sztućcu, talerzu, dłoni,'
          + ' opakowaniu. Gdy nie ma się do czego przyłożyć, napisz w "note", jaką porcję przyjąłeś.',
        '- Nie zgaduj tego, czego na zdjęciu nie widać — oleju ze smażenia, cukru w sosie, masła'
          + ' pod spodem — chyba że mówi o tym opis.',
        '- Gdy zdjęcie kłóci się z opisem, trzymaj się opisu i napisz o tym w "note".',
      ]
    : [];

  return [
    'Jesteś tablicą wartości odżywczych. Oszacuj kalorie i makroskładniki opisanego jedzenia.',
    '',
    'OPIS OD UŻYTKOWNIKA',
    '"""',
    description.trim(),
    '"""',
    '',
    'ZASADY',
    '- Odpowiedz samym JSON-em, bez komentarza i bez znaczników kodu.',
    '- Kształt: {"name": string, "basis": "SERVING" albo "G100", "kcal": liczba,'
      + ' "protein": liczba albo null, "carbs": liczba albo null, "fat": liczba albo null,'
      + ' "servingGrams": liczba albo null, "note": tekst albo null}',
    '- "basis": "SERVING", gdy opis mówi o konkretnym zjedzonym posiłku albo podaje ilości —'
      + ' wtedy liczby dotyczą całości tego, co opisano. "G100", gdy opis nazywa sam produkt'
      + ' bez ilości — wtedy liczby dotyczą 100 g.',
    '- "name": krótka polska nazwa, po której da się to rozpoznać na liście.',
    '- "kcal": liczba całkowita. "protein", "carbs", "fat": gramy, jedno miejsce po przecinku;'
      + ' null, gdy nie da się ocenić.',
    '- "servingGrams": szacowana masa całości w gramach przy "SERVING"; null przy "G100".',
    '- "note": jedno krótkie polskie zdanie o tym, co założyłeś — na przykład jak dużą porcję'
      + ' przyjąłeś. Bez porad i bez oceny diety.',
    '- Nie dokładaj składników, których w opisie nie ma. Przy wątpliwości bierz wielkości typowe'
      + ' dla polskiej kuchni.',
    '- Makroskładniki mają trzymać się kalorii: białko i węglowodany po 4 kcal na gram, tłuszcz 9.',
    ...photoRules,
  ].join('\n');
}

export type FoodEstimate = {
  /** Wersja robocza produktu — do poprawienia na ekranie, nie do zapisania w ciemno. */
  draft: FoodDraft;
  /** Co model założył; null, gdy nic nie powiedział. */
  note: string | null;
  /** Ostrzeżenie o odpowiedzi, która sama z sobą się nie zgadza. */
  warning: string | null;
};

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

const macro = (value: unknown, limit: number): number | null => {
  const parsed = number(value);
  if (parsed === null || parsed < 0 || parsed > limit) return null;
  return Math.round(parsed * 10) / 10;
};

type Reply = {
  name?: unknown;
  basis?: unknown;
  kcal?: unknown;
  protein?: unknown;
  carbs?: unknown;
  fat?: unknown;
  servingGrams?: unknown;
  note?: unknown;
};

/**
 * Odczyt odpowiedzi. Wartość nie z tego świata odrzucamy albo zerujemy, zamiast wpuszczać ją do
 * bazy: produkt z 12 000 kcal zepsułby każdy dzień, w którym się pojawi.
 *
 * `fallbackName` to opis wpisany przez użytkownika — gdy model nie zwróci nazwy, lepiej wziąć
 * jego własne słowa niż wymyślić coś za niego.
 */
export function parseFoodReply(reply: string, fallbackName = ''): FoodEstimate {
  const body = unwrapJson(reply);
  if (body === null) throw new FoodReplyError('Model nie zwrócił JSON-a.');

  let parsed: Reply;
  try {
    parsed = JSON.parse(body) as Reply;
  } catch {
    throw new FoodReplyError('Odpowiedzi modelu nie da się odczytać jako JSON.');
  }

  const basis: FoodBasis = parsed.basis === 'G100' ? 'G100' : 'SERVING';
  const kcal = number(parsed.kcal);
  const limit = basis === 'G100' ? MAX_KCAL_PER_100G : MAX_KCAL_PER_SERVING;
  if (kcal === null || kcal <= 0) throw new FoodReplyError('Model nie podał kalorii.');
  if (kcal > limit) {
    throw new FoodReplyError(`Model podał ${Math.round(kcal)} kcal — to nie może być prawda.`);
  }

  // Przy stu gramach makroskładnik nie przekroczy stu gramów; przy porcji ogranicza go jej masa,
  // której nie znamy, więc zostaje sam rozsądek.
  const macroLimit = basis === 'G100' ? MAX_MACRO_PER_100G : MAX_GRAMS;
  const protein = macro(parsed.protein, macroLimit);
  const carbs = macro(parsed.carbs, macroLimit);
  const fat = macro(parsed.fat, macroLimit);
  const grams = basis === 'SERVING' ? macro(parsed.servingGrams, MAX_GRAMS) : null;

  const draft: FoodDraft = {
    ...emptyFoodDraft(),
    name: text(parsed.name, NAME_LIMIT) ?? text(fallbackName, NAME_LIMIT) ?? 'Posiłek',
    basis,
    kcal: Math.round(kcal),
    proteinG: protein,
    carbsG: carbs,
    fatG: fat,
    servingGrams: grams,
  };

  return { draft, note: text(parsed.note, NOTE_LIMIT), warning: macroWarning(kcal, protein, carbs, fat) };
}

/**
 * Czy makroskładniki trzymają się kalorii. Rozjazd o ćwierć znaczy, że jedna z liczb jest
 * wzięta z powietrza — nie wiemy która, więc mówimy o tym zamiast poprawiać po cichu.
 */
function macroWarning(
  kcal: number,
  protein: number | null,
  carbs: number | null,
  fat: number | null,
): string | null {
  if (protein === null || carbs === null || fat === null) return null;
  const fromMacros = 4 * protein + 4 * carbs + 9 * fat;
  const slack = Math.max(0.25 * kcal, 50);
  if (Math.abs(fromMacros - kcal) <= slack) return null;
  return `Makroskładniki dają ${Math.round(fromMacros)} kcal, a model podał ${Math.round(kcal)}.`
    + ' Jedna z tych liczb jest zmyślona — sprawdź przed zapisem.';
}
