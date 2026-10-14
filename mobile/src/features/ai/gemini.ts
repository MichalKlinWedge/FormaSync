import { contentParts } from './gemini-request';
import { type AiModel, isModelName, normalizeModel, OTHER_WORK, sortModels } from './models';
import type { AiImage } from './providers';
import { describeStatus } from './status';
import { AiError, logFailure, send } from './transport';

/**
 * Gemini. Zapytanie idzie wprost z telefonu do Google, bez serwera pośrodku.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Na samą listę modeli czekamy krócej: to jedno zdanie odpowiedzi, nie praca modelu. */
const LIST_TIMEOUT_MS = 20_000;

/** Formaty, które Google przyjmuje jako zdjęcie. */
const IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Odpowiedź w postaci, jakiej potrzebujemy. Każde pole może nie przyjść. */
type Reply = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

export async function askGemini(
  key: string,
  model: string,
  prompt: string,
  image?: AiImage | null,
): Promise<string> {
  if (image != null && !IMAGES.includes(image.mimeType)) {
    throw new AiError('Gemini nie przyjmuje zdjęć w tym formacie.');
  }

  const response = await send(
    `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: contentParts(prompt, image) }],
        // Prosimy o JSON wprost; sam kształt opisuje polecenie, bo schemat przyjmowany przez
        // Gemini to osobna składnia, a jeden błąd w niej wywraca całe zapytanie.
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
    },
    { provider: 'GEMINI', label: `Gemini ${model}${image ? ' ze zdjęciem' : ''}` },
  );

  const body = (await response.json().catch(() => null)) as Reply | null;
  if (!response.ok) {
    logFailure(`Gemini ${model}`, `HTTP ${response.status}: ${body?.error?.message ?? 'bez treści'}`);
    // Awarię po stronie Google warto powtórzyć; odmowę z klucza albo z nazwy modelu — nie, bo
    // drugie takie samo zapytanie dostanie tę samą odpowiedź.
    throw new AiError(describeStatus('GEMINI', response.status, body?.error?.message, model), {
      retryable: response.status >= 500,
      modelGone: response.status === 404,
    });
  }

  const blocked = body?.promptFeedback?.blockReason;
  if (blocked !== undefined) {
    logFailure(`Gemini ${model}`, `odmowa: ${blocked}`);
    throw new AiError(`Gemini odmówił odpowiedzi (${blocked}).`);
  }

  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (text.trim() === '') {
    logFailure(`Gemini ${model}`, 'pusta odpowiedź');
    throw new AiError('Gemini zwrócił pustą odpowiedź.', { retryable: true });
  }
  return text;
}

type ModelRow = {
  name?: string | null;
  displayName?: string | null;
  supportedGenerationMethods?: string[] | null;
};

export type ModelListReply = { models?: ModelRow[] | null } | null;

/** Lista modeli z odpowiedzi Google, zawężona do tych, które potrafią napisać tekst. */
export function parseModelList(body: ModelListReply): AiModel[] {
  const found = new Map<string, AiModel>();

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

  return sortModels([...found.values()]);
}

/**
 * Modele dostępne dla tego klucza. Nazw nie zgadujemy ani nie wpisujemy z pamięci — Google
 * wycofuje warianty w swoim tempie, a jedyna pewna lista jest po jego stronie.
 */
export async function geminiModels(key: string): Promise<AiModel[]> {
  const response = await send(
    `${ENDPOINT}?key=${encodeURIComponent(key)}&pageSize=200`,
    {},
    { provider: 'GEMINI', label: 'Gemini — lista modeli', timeoutMs: LIST_TIMEOUT_MS },
  );

  const body = (await response.json().catch(() => null)) as
    | (ModelListReply & { error?: { message?: string } })
    | null;

  if (!response.ok) {
    logFailure('Gemini — lista modeli', `HTTP ${response.status}: ${body?.error?.message ?? 'bez treści'}`);
    throw new AiError(describeStatus('GEMINI', response.status, body?.error?.message, ''), {
      retryable: response.status >= 500,
    });
  }

  const models = parseModelList(body);
  if (models.length === 0) throw new AiError('Google nie zwrócił ani jednego modelu do tekstu.');
  return models;
}
