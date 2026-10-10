/**
 * Nazwa modelu Gemini.
 *
 * Pole w ustawieniach jest wolnym tekstem, bo Google wycofuje i dokłada warianty szybciej, niż
 * wychodzą wersje aplikacji. API przyjmuje jednak identyfikator (`gemini-3.5-flash-lite`), a nie
 * nazwę ze strony („Gemini 3.5 Flash-Lite”) — wpisana wprost kończy się odmową „unexpected model
 * name format”. Nazwę sprowadzamy więc do identyfikatora sami, zamiast kazać ją przepisywać,
 * a listę dostępnych wariantów umiemy pobrać wprost z Google, żeby nie trzeba jej było zgadywać.
 */

/** Identyfikator z tego, co ktoś wpisał albo wkleił. Puste znaczy: nie da się nic sensownego. */
export function normalizeModel(raw: string): string {
  return raw
    .trim()
    .replace(/^models\//i, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Czy identyfikator da się w ogóle wysłać: litery, cyfry, kropki i myślniki — nic poza tym. */
export function isModelName(value: string): boolean {
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value);
}

export type GeminiModel = { id: string; label: string };

type ModelRow = {
  name?: string | null;
  displayName?: string | null;
  supportedGenerationMethods?: string[] | null;
};

export type ModelListReply = { models?: ModelRow[] | null } | null;

/** Modele od innej roboty niż pisanie tekstu. Odsiew po nazwie — ostatnia deska ratunku. */
const OTHER_WORK = /embedding|aqa|imagen|veo|image|tts|audio|live/;

/** Czy wariant jest zapowiedzią. Takie schodzą na dół listy, bo znikają bez uprzedzenia. */
const unstable = (id: string): boolean => /preview|exp\b|experimental/.test(id);

/** Lista modeli z odpowiedzi Google, zawężona do tych, które potrafią ułożyć plan. */
export function parseModelList(body: ModelListReply): GeminiModel[] {
  const found = new Map<string, GeminiModel>();

  for (const row of body?.models ?? []) {
    const id = normalizeModel(row?.name ?? '');
    if (id === '' || !isModelName(id)) continue;

    const methods = row?.supportedGenerationMethods;
    if (Array.isArray(methods) && methods.length > 0) {
      if (!methods.includes('generateContent')) continue;
    } else if (OTHER_WORK.test(id)) {
      // Spis metod bywa pusty — wtedy zostaje nazwa. Lepiej pokazać model za dużo niż pustą listę.
      continue;
    }

    if (!found.has(id)) found.set(id, { id, label: row?.displayName?.trim() || id });
  }

  return [...found.values()].sort((a, b) => {
    if (unstable(a.id) !== unstable(b.id)) return unstable(a.id) ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}
