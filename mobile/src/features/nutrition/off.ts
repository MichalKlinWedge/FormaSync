import type { FoodDraft, PortionChoice } from './food';

/**
 * Produkt z kodu kreskowego — Open Food Facts.
 *
 * Baza jest otwarta, bez klucza i bez konta, ale w zamian prosi o dwie rzeczy: żeby aplikacja się
 * przedstawiła i żeby nie pytać częściej niż piętnaście razy na minutę. Jedno skanowanie to jedno
 * pytanie, więc limit nas nie dotyczy — przedstawić się trzeba zawsze.
 *
 * Z odpowiedzi bierzemy tylko wartości na 100 g i to, z czego da się zrobić miarkę. Reszta — a jest
 * jej kilkadziesiąt kilobajtów na produkt — nas nie interesuje, więc o nią nie prosimy.
 *
 * Moduł jest czysty: zapytanie dostaje `fetch` w argumencie, a tłumaczenie odpowiedzi na wersję
 * roboczą produktu nie rusza sieci wcale. Inaczej nie dałoby się tego sprawdzić bez telefonu.
 */

/**
 * `AppName/Version (kontakt)` — format wymagany przez Open Food Facts. Wersja jest tu zgrubna
 * i wpisana na stałe: baza chce wiedzieć, która aplikacja pyta, a nie który build — gdyby miała
 * iść z `app.json`, rozjechałaby się przy pierwszym podbiciu numeru.
 */
export const OFF_USER_AGENT = 'FormaSync/1.0 (https://github.com/MichalKlinWedge/FormaSync)';

/** Dane produktów są na licencji ODbL — tyle, ile trzeba pokazać przy pokazanych wartościach. */
export const OFF_ATTRIBUTION = 'Dane produktu z Open Food Facts (licencja ODbL).';

const FIELDS = [
  'code',
  'product_name',
  'product_name_pl',
  'brands',
  'quantity',
  'product_quantity',
  'serving_size',
  'serving_quantity',
  'nutrition_data_per',
  'nutriments',
];

/** Wersja 3 API; `fields` skraca odpowiedź z kilkudziesięciu kilobajtów do kilkuset bajtów. */
export const productUrl = (barcode: string): string =>
  `https://world.openfoodfacts.org/api/v3/product/${barcode}.json?fields=${FIELDS.join(',')}`;

export class OffError extends Error {}

/** Ile czekamy na odpowiedź, zanim powiemy, że nie wyszło. */
const TIMEOUT_MS = 12_000;

/** Granice zdrowego rozsądku: czysty tłuszcz to 900 kcal na 100 g, więcej nie istnieje. */
const MAX_KCAL_PER_100G = 900;
/** Masa porcji i opakowania: więcej niż pięć kilogramów to błąd w danych, nie posiłek. */
const MAX_PORTION_GRAMS = 5000;

/**
 * Kod z czytnika albo z ręki: same cyfry, długość jak w EAN-8, UPC-A, EAN-13 lub ITF-14. Sumy
 * kontrolnej nie liczymy — czytnik kamery sprawdza ją sam, a kod wpisany ręcznie i tak zweryfikuje
 * baza, odpowiadając „nie znam”.
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return [8, 12, 13, 14].includes(digits.length) ? digits : null;
}

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json => (typeof value === 'object' && value !== null ? (value as Json) : {});

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Liczba z zakresu albo nic. Open Food Facts potrafi podać wartość tekstem albo nie podać wcale. */
function asNumber(value: unknown, max: number): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null;
  return Math.round(parsed * 10) / 10;
}

export type ScannedFood = {
  draft: FoodDraft;
  /** Co trzeba wiedzieć o tych liczbach, zanim się na nich oprze dzień; null, gdy nic. */
  note: string | null;
};

/**
 * Odpowiedź bazy na wersję roboczą produktu. Wersja robocza, a nie gotowy wpis — w bazie siedzą
 * dane wpisane przez ludzi i czasem są puste albo bezsensowne, więc ostatnie słowo ma ten, kto je
 * widzi na ekranie.
 */
export function productToDraft(raw: unknown, barcode: string): ScannedFood {
  const product = asObject(raw);
  const nutriments = asObject(product.nutriments);

  const brands = asText(product.brands)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const name = asText(product.product_name_pl) || asText(product.product_name) || brands[0] || '';
  if (name === '') {
    throw new OffError(`Kod ${barcode} jest w bazie, ale bez nazwy produktu. Wpisz go z ręki.`);
  }

  const kcal = kcalPer100(nutriments);
  if (kcal === null) {
    throw new OffError(`„${name}” jest w bazie bez wartości odżywczych. Przepisz je z opakowania.`);
  }

  // Pierwsza marka z listy jest tą właściwą; dalsze to zwykle właściciel i spółka matka.
  const brand = brands[0] ?? null;
  const perMl = asText(product.nutrition_data_per) === '100ml';

  return {
    draft: {
      name,
      brand: brand === name ? null : brand,
      basis: 'G100',
      kcal,
      proteinG: asNumber(nutriments.proteins_100g, 100),
      carbsG: asNumber(nutriments.carbohydrates_100g, 100),
      fatG: asNumber(nutriments.fat_100g, 100),
      servingName: null,
      servingGrams: null,
      portions: portionsOf(product),
    },
    note: perMl ? 'Wartości są na 100 ml — przyjmujemy, że tyle waży 100 g.' : null,
  };
}

/** Kalorie na 100 g. Gdy baza ma tylko kilodżule, przeliczamy je sami — 1 kcal to 4,184 kJ. */
function kcalPer100(nutriments: Json): number | null {
  const direct = asNumber(nutriments['energy-kcal_100g'], MAX_KCAL_PER_100G);
  if (direct !== null && direct > 0) return Math.round(direct);

  const kj = asNumber(nutriments.energy_100g, MAX_KCAL_PER_100G * 4.184);
  if (kj !== null && kj > 0) return Math.round(kj / 4.184);
  return null;
}

/**
 * Miarki z opakowania: porcja producenta i całe opakowanie. To one zamieniają „ile gramów?”
 * w jedno dotknięcie, a są w danych za darmo — szkoda ich nie zapisać.
 */
function portionsOf(product: Json): PortionChoice[] {
  const portions: PortionChoice[] = [];

  const serving = asNumber(product.serving_quantity, MAX_PORTION_GRAMS);
  if (serving !== null && serving > 0) {
    portions.push({ name: asText(product.serving_size) || 'porcja', amount: serving });
  }

  const pack = asNumber(product.product_quantity, MAX_PORTION_GRAMS);
  if (pack !== null && pack > 0 && pack !== serving) {
    const size = asText(product.quantity);
    portions.push({ name: size === '' ? 'całe opakowanie' : `całe opakowanie (${size})`, amount: pack });
  }
  return portions;
}

/**
 * Pyta bazę o kod i zwraca wersję roboczą produktu.
 *
 * Każdy nieudany przypadek ma własne zdanie, bo każdy znaczy coś innego: kodu nie ma w bazie,
 * baza prosi o przerwę, albo telefon nie ma sieci. „Nie udało się” bez wyjaśnienia kazałoby
 * skanować drugi raz coś, czego i tak tam nie ma.
 */
export async function lookupBarcode(barcode: string, fetchImpl: typeof fetch = fetch): Promise<ScannedFood> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(productUrl(barcode), {
      headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch {
    throw new OffError('Brak połączenia z bazą produktów. Produkt możesz wpisać z ręki.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new OffError(`Kodu ${barcode} nie ma w Open Food Facts. Wpisz produkt z ręki — zostanie w Twojej bazie.`);
  }
  if (response.status === 429) {
    throw new OffError('Baza produktów prosi o chwilę przerwy. Spróbuj za minutę.');
  }
  if (!response.ok) {
    throw new OffError(`Baza produktów odpowiedziała błędem ${response.status}.`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OffError('Odpowiedź bazy produktów była nieczytelna.');
  }

  const product = asObject(body).product;
  if (product === undefined || product === null) {
    throw new OffError(`Kodu ${barcode} nie ma w Open Food Facts. Wpisz produkt z ręki — zostanie w Twojej bazie.`);
  }
  return productToDraft(product, barcode);
}
