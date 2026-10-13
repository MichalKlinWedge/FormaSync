import { askClaude, claudeModels } from './claude';
import { askGemini, geminiModels } from './gemini';
import { type AiModel, isModelName } from './models';
import { askOpenAi, openAiModels } from './openai';
import { type AiImage, PROVIDER_LABELS, type Provider } from './providers';
import { defaultProvider, loadApiKey, modelName } from './tokens';
import { AiError } from './transport';

/**
 * Jedno wejście do wszystkich dostawców.
 *
 * Reszta aplikacji nie wie, czy odpowiada Gemini, Claude czy ChatGPT — pyta o tekst i dostaje
 * tekst. Dzięki temu polecenia i odczyt odpowiedzi są wspólne, a dołożenie kolejnego dostawcy nie
 * dotyka ani planisty, ani kalorii.
 */

export { AiError } from './transport';
export type { AiImage, Provider } from './providers';

export class NoApiKeyError extends AiError {
  constructor(provider: Provider) {
    super(`Nie ma klucza do ${PROVIDER_LABELS[provider]}. Wklej go w Ustawieniach.`);
  }
}

export class NoModelError extends AiError {
  constructor(provider: Provider) {
    super(
      `Nie wiadomo, którego modelu ${PROVIDER_LABELS[provider]} użyć. Pobierz listę w Ustawieniach`
        + ' i wybierz z niej.',
    );
  }
}

/** Dostawca i model gotowe do zapytania; po drodze wypadają wszystkie „nie ma czym”. */
async function ready(provider: Provider): Promise<{ key: string; model: string }> {
  const key = await loadApiKey(provider);
  if (key === null) throw new NoApiKeyError(provider);

  // Nazwę sprawdzamy u siebie: inaczej odpowiedzią na nazwę ze strony dostawcy jest komunikat API
  // o formacie, z którego nie wynika, co zrobić.
  const model = modelName(provider);
  if (model === '') throw new NoModelError(provider);
  if (!isModelName(model)) {
    throw new AiError(
      `„${model}” to nie jest nazwa modelu, tylko jej opis. Pobierz listę modeli w Ustawieniach`
        + ' i wybierz nazwę z niej.',
    );
  }

  return { key, model };
}

/**
 * Sam tekst odpowiedzi modelu. Zdjęcie jest opcjonalne i doklejane do tej samej wiadomości —
 * korzystają z tego kalorie, gdzie obraz mówi, *co* to jest, a tekst *ile* tego było.
 */
export async function askAi(
  prompt: string,
  options: { provider?: Provider; image?: AiImage | null } = {},
): Promise<string> {
  const provider = options.provider ?? defaultProvider();
  const { key, model } = await ready(provider);
  const image = options.image;

  if (provider === 'CLAUDE') return askClaude(key, model, prompt, image);
  if (provider === 'OPENAI') return askOpenAi(key, model, prompt, image);
  return askGemini(key, model, prompt, image);
}

/**
 * Modele dostępne dla zapisanego klucza. Nazw nie zgadujemy ani nie wpisujemy z pamięci — dostawcy
 * wycofują warianty w swoim tempie, a jedyna pewna lista jest po ich stronie.
 */
export async function listAiModels(provider: Provider): Promise<AiModel[]> {
  const key = await loadApiKey(provider);
  if (key === null) throw new NoApiKeyError(provider);

  if (provider === 'CLAUDE') return claudeModels(key);
  if (provider === 'OPENAI') return openAiModels(key);
  return geminiModels(key);
}
