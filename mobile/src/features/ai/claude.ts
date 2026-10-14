import { type AiModel, isModelName, normalizeModel, sortModels } from './models';
import type { AiImage } from './providers';
import { describeStatus } from './status';
import { AiError, logFailure, send } from './transport';

/**
 * Claude. Zapytanie idzie wprost z telefonu do Anthropic, bez serwera pośrodku.
 */

const ENDPOINT = 'https://api.anthropic.com/v1';

/** Wersja API w nagłówku — Anthropic wymaga jej przy każdym zapytaniu. */
const VERSION = '2023-06-01';

/** Na samą listę modeli czekamy krócej: to jedno zdanie odpowiedzi, nie praca modelu. */
const LIST_TIMEOUT_MS = 20_000;

/**
 * Najdłuższa odpowiedź, o jaką prosimy. Anthropic wymaga tego pola, a plan na kilkanaście tygodni
 * bywa długi — przy ciaśniejszym limicie odpowiedź urwałaby się w połowie JSON-a.
 */
const MAX_TOKENS = 8000;

/** Formaty, które Anthropic przyjmuje jako zdjęcie. */
const IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

type Reply = {
  content?: { type?: string; text?: string }[];
  error?: { message?: string; type?: string };
};

const headers = (key: string) => ({
  'content-type': 'application/json',
  'x-api-key': key,
  'anthropic-version': VERSION,
});

export async function askClaude(
  key: string,
  model: string,
  prompt: string,
  image?: AiImage | null,
): Promise<string> {
  if (image != null && !IMAGES.includes(image.mimeType)) {
    throw new AiError('Claude nie przyjmuje zdjęć w tym formacie. Zrób je aparatem w aplikacji.');
  }

  // Zdjęcie idzie przed tekstem, bo polecenie się do niego odwołuje — tak samo jak u Gemini.
  const content: unknown[] = [];
  if (image != null) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mimeType, data: image.data },
    });
  }
  content.push({ type: 'text', text: prompt });

  const response = await send(
    `${ENDPOINT}/messages`,
    {
      method: 'POST',
      headers: headers(key),
      // O czysty JSON prosi samo polecenie: Anthropic nie ma przełącznika formatu odpowiedzi,
      // a każdą odpowiedź i tak przepuszczamy przez wyłuskanie JSON-a ze znaczników kodu.
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        temperature: 0.4,
        messages: [{ role: 'user', content }],
      }),
    },
    { provider: 'CLAUDE', label: `Claude ${model}${image ? ' ze zdjęciem' : ''}` },
  );

  const body = (await response.json().catch(() => null)) as Reply | null;
  if (!response.ok) {
    logFailure(`Claude ${model}`, `HTTP ${response.status}: ${body?.error?.message ?? 'bez treści'}`);
    throw new AiError(describeStatus('CLAUDE', response.status, body?.error?.message, model), {
      retryable: response.status >= 500,
      modelGone: response.status === 404,
    });
  }

  const text = (body?.content ?? [])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text ?? '')
    .join('');

  if (text.trim() === '') {
    logFailure(`Claude ${model}`, 'pusta odpowiedź');
    throw new AiError('Claude zwrócił pustą odpowiedź.', { retryable: true });
  }
  return text;
}

type ModelRow = { id?: string | null; display_name?: string | null };

export type ClaudeListReply = { data?: ModelRow[] | null } | null;

/** Lista modeli z odpowiedzi Anthropic. Wszystkie piszą tekst, więc nie ma czego odsiewać. */
export function parseClaudeModels(body: ClaudeListReply): AiModel[] {
  const found = new Map<string, AiModel>();

  for (const row of body?.data ?? []) {
    const id = normalizeModel(row?.id ?? '');
    if (id === '' || !isModelName(id)) continue;
    if (!found.has(id)) found.set(id, { id, label: row?.display_name?.trim() || id });
  }

  return sortModels([...found.values()]);
}

export async function claudeModels(key: string): Promise<AiModel[]> {
  const response = await send(
    `${ENDPOINT}/models?limit=200`,
    { headers: headers(key) },
    { provider: 'CLAUDE', label: 'Claude — lista modeli', timeoutMs: LIST_TIMEOUT_MS },
  );

  const body = (await response.json().catch(() => null)) as
    | (ClaudeListReply & { error?: { message?: string } })
    | null;

  if (!response.ok) {
    logFailure('Claude — lista modeli', `HTTP ${response.status}: ${body?.error?.message ?? 'bez treści'}`);
    throw new AiError(describeStatus('CLAUDE', response.status, body?.error?.message, ''), {
      retryable: response.status >= 500,
    });
  }

  const models = parseClaudeModels(body);
  if (models.length === 0) throw new AiError('Anthropic nie zwrócił ani jednego modelu.');
  return models;
}
