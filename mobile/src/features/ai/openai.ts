import { type AiModel, isModelName, normalizeModel, OTHER_WORK, sortModels } from './models';
import type { AiImage } from './providers';
import { describeStatus } from './status';
import { AiError, logFailure, send } from './transport';

/**
 * ChatGPT. Zapytanie idzie wprost z telefonu do OpenAI, bez serwera pośrodku.
 */

const ENDPOINT = 'https://api.openai.com/v1';

/** Na samą listę modeli czekamy krócej: to jedno zdanie odpowiedzi, nie praca modelu. */
const LIST_TIMEOUT_MS = 20_000;

/** Formaty, które OpenAI przyjmuje jako zdjęcie. */
const IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

type Reply = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string; type?: string };
};

export async function askOpenAi(
  key: string,
  model: string,
  prompt: string,
  image?: AiImage | null,
): Promise<string> {
  if (image != null && !IMAGES.includes(image.mimeType)) {
    throw new AiError('ChatGPT nie przyjmuje zdjęć w tym formacie. Zrób je aparatem w aplikacji.');
  }

  // Zdjęcie idzie przed tekstem, bo polecenie się do niego odwołuje — tak samo jak u pozostałych.
  const content: unknown[] = [];
  if (image != null) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    });
  }
  content.push({ type: 'text', text: prompt });

  const response = await send(
    `${ENDPOINT}/chat/completions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // Bez `temperature` i bez wymuszania formatu odpowiedzi: nowsze rodziny modeli odrzucają te
      // pola całym zapytaniem, a o czysty JSON prosi samo polecenie — i tak każdą odpowiedź
      // przepuszczamy przez wyłuskanie JSON-a. Lepiej stracić drobną pewność niż dostać 400 za
      // pole, którego akurat ten model nie zna.
      body: JSON.stringify({ model, messages: [{ role: 'user', content }] }),
    },
    { provider: 'OPENAI', label: `ChatGPT ${model}${image ? ' ze zdjęciem' : ''}` },
  );

  const body = (await response.json().catch(() => null)) as Reply | null;
  if (!response.ok) {
    logFailure(`ChatGPT ${model}`, `HTTP ${response.status}: ${body?.error?.message ?? 'bez treści'}`);
    throw new AiError(describeStatus('OPENAI', response.status, body?.error?.message, model), {
      retryable: response.status >= 500,
      modelGone: response.status === 404,
    });
  }

  const text = body?.choices?.[0]?.message?.content ?? '';
  if (text.trim() === '') {
    logFailure(`ChatGPT ${model}`, 'pusta odpowiedź');
    throw new AiError('ChatGPT zwrócił pustą odpowiedź.', { retryable: true });
  }
  return text;
}

type ModelRow = { id?: string | null };

export type OpenAiListReply = { data?: ModelRow[] | null } | null;

/**
 * Lista modeli z odpowiedzi OpenAI. Zwraca wszystko, co konto umie wywołać — razem z osadzaniem,
 * mową i obrazem — a spisu umiejętności przy modelu nie ma, więc zostaje odsiew po nazwie.
 */
export function parseOpenAiModels(body: OpenAiListReply): AiModel[] {
  const found = new Map<string, AiModel>();

  for (const row of body?.data ?? []) {
    const id = normalizeModel(row?.id ?? '');
    if (id === '' || !isModelName(id) || OTHER_WORK.test(id)) continue;
    if (!found.has(id)) found.set(id, { id, label: id });
  }

  return sortModels([...found.values()]);
}

export async function openAiModels(key: string): Promise<AiModel[]> {
  const response = await send(
    `${ENDPOINT}/models`,
    { headers: { Authorization: `Bearer ${key}` } },
    { provider: 'OPENAI', label: 'ChatGPT — lista modeli', timeoutMs: LIST_TIMEOUT_MS },
  );

  const body = (await response.json().catch(() => null)) as
    | (OpenAiListReply & { error?: { message?: string } })
    | null;

  if (!response.ok) {
    logFailure('ChatGPT — lista modeli', `HTTP ${response.status}: ${body?.error?.message ?? 'bez treści'}`);
    throw new AiError(describeStatus('OPENAI', response.status, body?.error?.message, ''), {
      retryable: response.status >= 500,
    });
  }

  const models = parseOpenAiModels(body);
  if (models.length === 0) throw new AiError('OpenAI nie zwrócił ani jednego modelu do tekstu.');
  return models;
}
