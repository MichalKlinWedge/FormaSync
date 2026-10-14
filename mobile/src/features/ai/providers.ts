/**
 * Dostawcy modeli, z których aplikacja umie korzystać.
 *
 * Każdy jest opcjonalny i każdy rozliczany na Twoim koncie: wklejasz klucz tylko do tego, którego
 * chcesz używać. Aplikacja nie ma własnego konta u żadnego z nich i nie pośredniczy — zapytanie
 * idzie wprost z telefonu tam, dokąd wskazuje wybrany dostawca.
 */

export const providers = ['GEMINI', 'CLAUDE', 'OPENAI'] as const;
export type Provider = (typeof providers)[number];

/** Nazwa modelu po ludzku — tak, jak mówi o nim użytkownik. */
export const PROVIDER_LABELS: Record<Provider, string> = {
  GEMINI: 'Gemini',
  CLAUDE: 'Claude',
  OPENAI: 'ChatGPT',
};

/** Kto stoi za modelem. Przy zdaniu „dane idą do…” liczy się firma, nie nazwa modelu. */
export const PROVIDER_COMPANIES: Record<Provider, string> = {
  GEMINI: 'Google',
  CLAUDE: 'Anthropic',
  OPENAI: 'OpenAI',
};

/** Gdzie się zakłada klucz. Bez tego zdania pole „wklej klucz” jest ślepą uliczką. */
export const PROVIDER_KEY_SOURCES: Record<Provider, string> = {
  GEMINI: 'Google AI Studio (aistudio.google.com)',
  CLAUDE: 'konsola Anthropic (console.anthropic.com)',
  OPENAI: 'panel OpenAI (platform.openai.com)',
};

/**
 * Wariant domyślny. Pusto znaczy „nie zgadujemy”: nazwy modeli wycofują się szybciej niż wychodzą
 * wersje aplikacji, a wpisana z pamięci kończy się odmową, z której nic nie wynika. Przy pustym
 * ekran każe pobrać listę od dostawcy i wybrać z niej — to jedyne pewne źródło.
 */
export const DEFAULT_MODELS: Record<Provider, string> = {
  // gemini-2.5-flash Google zamknął dla nowych kluczy i sam odsyła stąd do 3.8.
  GEMINI: 'gemini-3.8-flash',
  CLAUDE: 'claude-sonnet-5-5',
  OPENAI: '',
};

/**
 * Zdjęcie doklejone do zapytania: typ MIME i zawartość w base64. Wspólne dla dostawców, choć każdy
 * pakuje je inaczej — i każdy przyjmuje swój zestaw formatów, więc sprawdza to jego moduł.
 */
export type AiImage = { mimeType: string; data: string };
