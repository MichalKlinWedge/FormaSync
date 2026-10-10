import type { FormWorkout } from '../brief';
import type { GoalBrief, PlannedWeek } from '../planner';

import { isModelName, parseModelList, type GeminiModel, type ModelListReply } from './models';
import { buildPrompt, parsePlanReply, PlanReplyError } from './prompt';
import { loadApiKey, modelName } from './tokens';

/**
 * Plan ułożony przez Gemini. Dokładamy go jako drugą opcję obok reguł — nie zamiast nich:
 * bez klucza, bez internetu i po błędzie po stronie Google aplikacja nadal układa plan sama.
 *
 * API nie testowaliśmy na żywym kluczu, więc każdy krok odpowiedzi traktujemy jako możliwy do
 * zniknięcia i mówimy wprost, co poszło nie tak — zamiast milczeć i pokazać pusty plan.
 */

export class GeminiError extends Error {}
export class NoApiKeyError extends GeminiError {
  constructor() {
    super('Najpierw wklej klucz do Gemini w ustawieniach celu.');
  }
}

export { PlanReplyError } from './prompt';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Odpowiedź w postaci, jakiej potrzebujemy. Każde pole może nie przyjść. */
type GeminiReply = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

function describeStatus(status: number, message: string | undefined): string {
  if (status === 400) {
    // Odmowa z nazwy modelu wraca jako surowy komunikat API — bez tłumaczenia nie mówi nic o tym,
    // gdzie tę nazwę zmienić.
    if ((message ?? '').toLowerCase().includes('model')) {
      return `Google nie przyjął nazwy modelu „${modelName()}”. Pobierz listę modeli w ustawieniach planisty i wybierz nazwę z niej.`;
    }
    return message ?? 'Google odrzucił zapytanie jako nieprawidłowe.';
  }
  if (status === 401 || status === 403) return 'Klucz do Gemini jest nieważny albo bez uprawnień.';
  if (status === 404) return 'Taki model nie istnieje. Sprawdź jego nazwę w ustawieniach celu.';
  if (status === 429) return 'Wyczerpany limit zapytań do Gemini. Spróbuj później.';
  if (status >= 500) return 'Gemini chwilowo nie odpowiada. Spróbuj później.';
  return message ?? `Gemini odrzucił zapytanie (kod ${status}).`;
}

/** Sam tekst odpowiedzi modelu. Rozbite na osobny krok, żeby dało się je przetestować bez sieci. */
export async function askGemini(prompt: string): Promise<string> {
  const key = await loadApiKey();
  if (key === null) throw new NoApiKeyError();

  // Nazwę sprawdzamy u siebie: inaczej odpowiedzią na nazwę ze strony Google jest komunikat API
  // o formacie, z którego nie wynika, co zrobić.
  const model = modelName();
  if (!isModelName(model)) {
    throw new GeminiError(
      `„${model}” to nie jest nazwa modelu, tylko jej opis. Pobierz listę modeli w ustawieniach planisty i wybierz nazwę z niej.`,
    );
  }

  const response = await fetch(
    `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // Prosimy o JSON wprost; sam kształt opisuje polecenie, bo schemat przyjmowany przez
        // Gemini to osobna składnia, a jeden błąd w niej wywraca całe zapytanie.
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
    },
  );

  const body = (await response.json().catch(() => null)) as GeminiReply | null;
  if (!response.ok) throw new GeminiError(describeStatus(response.status, body?.error?.message));

  const blocked = body?.promptFeedback?.blockReason;
  if (blocked !== undefined) throw new GeminiError(`Gemini odmówił odpowiedzi (${blocked}).`);

  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  if (text.trim() === '') throw new GeminiError('Gemini zwrócił pustą odpowiedź.');
  return text;
}

/**
 * Modele dostępne dla tego klucza. Nazw nie zgadujemy ani nie wpisujemy z pamięci — Google
 * wycofuje warianty w swoim tempie, a jedyna pewna lista jest po jego stronie.
 */
export async function listGeminiModels(): Promise<GeminiModel[]> {
  const key = await loadApiKey();
  if (key === null) throw new NoApiKeyError();

  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}&pageSize=200`);
  const body = (await response.json().catch(() => null)) as (ModelListReply & {
    error?: { message?: string };
  }) | null;
  if (!response.ok) throw new GeminiError(describeStatus(response.status, body?.error?.message));

  const models = parseModelList(body);
  if (models.length === 0) throw new GeminiError('Google nie zwrócił ani jednego modelu do tekstu.');
  return models;
}

/** Cały przebieg: polecenie, zapytanie, odczyt planu. */
export async function planWithGemini(
  brief: GoalBrief,
  history: FormWorkout[],
  from: string,
): Promise<PlannedWeek[]> {
  const reply = await askGemini(buildPrompt(brief, history, from));
  try {
    return parsePlanReply(reply, brief, from);
  } catch (error) {
    // Błąd odczytu zostawiamy rozpoznawalnym: ekran ma zaproponować plan z reguł, a nie udawać,
    // że to awaria sieci.
    throw error instanceof PlanReplyError ? error : new GeminiError('Nie udało się odczytać planu.');
  }
}
