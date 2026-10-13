import * as SecureStore from 'expo-secure-store';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';

import { normalizeModel } from './models';
import { DEFAULT_MODELS, type Provider, providers } from './providers';

/**
 * Klucze do modeli i wybór dostawcy.
 *
 * Klucze trzymamy w SecureStore, nie w bazie — baza jedzie w kopii zapasowej, którą przenosisz na
 * komputer, a klucz rozliczany na Twoim koncie nie ma prawa tam trafić. Nazwa modelu to zwykłe
 * ustawienie: dostawcy wycofują i dokładają warianty, więc musi dać się ją zmienić bez nowej
 * wersji aplikacji.
 *
 * Nazwy wpisów zostają takie, jakie były dla Gemini — kto ma już wklejony klucz, nie musi robić
 * nic ponownie tylko dlatego, że doszli inni dostawcy.
 */

const SECURE_KEYS: Record<Provider, string> = {
  GEMINI: 'gemini_api_key',
  CLAUDE: 'claude_api_key',
  OPENAI: 'openai_api_key',
};

const MODEL_KEYS: Record<Provider, string> = {
  GEMINI: 'gemini_model',
  CLAUDE: 'claude_model',
  OPENAI: 'openai_model',
};

/** Dostawca brany wtedy, gdy ekran nie pyta. */
export const PROVIDER_KEY = 'ai_provider';

export async function saveApiKey(provider: Provider, value: string | null): Promise<void> {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    await SecureStore.deleteItemAsync(SECURE_KEYS[provider]).catch(() => {});
    return;
  }
  await SecureStore.setItemAsync(SECURE_KEYS[provider], trimmed);
}

export async function loadApiKey(provider: Provider): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_KEYS[provider]);
    return raw === null || raw.trim() === '' ? null : raw.trim();
  } catch {
    // Nieodczytywalny wpis traktujemy jak brak — użytkownik wklei klucz ponownie.
    return null;
  }
}

export const hasApiKey = async (provider: Provider): Promise<boolean> =>
  (await loadApiKey(provider)) !== null;

/** Dostawcy, którymi da się w ogóle zapytać. Bez klucza dostawca nie istnieje dla aplikacji. */
export async function configuredProviders(): Promise<Provider[]> {
  const found: Provider[] = [];
  for (const provider of providers) {
    if (await hasApiKey(provider)) found.push(provider);
  }
  return found;
}

/**
 * Nazwa modelu w postaci, jakiej żąda API. Sprowadzamy ją przy odczycie, a nie tylko przy zapisie,
 * bo w ustawieniach może już leżeć nazwa przepisana ze strony dostawcy — i ma zadziałać bez
 * ponownego wpisywania.
 */
export const modelName = (provider: Provider): string =>
  normalizeModel(getSetting(db, MODEL_KEYS[provider]) ?? '') || DEFAULT_MODELS[provider];

export const saveModelName = (provider: Provider, value: string | null): void =>
  setSetting(db, MODEL_KEYS[provider], normalizeModel(value ?? '') || null);

export const defaultProvider = (): Provider =>
  providers.find((provider) => provider === getSetting(db, PROVIDER_KEY)) ?? 'GEMINI';

export const saveDefaultProvider = (provider: Provider): void =>
  setSetting(db, PROVIDER_KEY, provider);

/**
 * Wytyczne od zawodnika. Reguły wpisane w aplikację są ogólne — „co czwarty tydzień lżejszy”,
 * „dwa tygodnie zejścia” — i nie wiedzą nic o tym, że akurat wracasz po przerwie albo że
 * w tygodniu masz najwyżej cztery wolne wieczory. To jest miejsce na takie rzeczy, bez
 * przepisywania aplikacji.
 *
 * Format odpowiedzi i twarde ograniczenia planu zostają poza zasięgiem tego pola: na nich stoi
 * odczyt planu, a zmiana przez pomyłkę kończyłaby się odrzuceniem całej odpowiedzi.
 */
export const GUIDANCE_KEY = 'gemini_guidance';

/** Najdłuższe wytyczne, jakie wysyłamy. Dalej to już nie wskazówka, tylko drugi plan. */
export const GUIDANCE_LIMIT = 2000;

export const guidance = (): string => (getSetting(db, GUIDANCE_KEY) ?? '').trim();

export const saveGuidance = (value: string | null): void =>
  setSetting(db, GUIDANCE_KEY, value?.trim().slice(0, GUIDANCE_LIMIT) || null);

/**
 * Zgoda na wysłanie danych poza telefon. Pytamy raz i zapisujemy, bo to pierwsza rzecz w tej
 * aplikacji, która wypuszcza treningi na zewnątrz — ekran Prywatności obiecuje, że dane wychodzą
 * tylko tam, gdzie sam je wyślesz, i tę obietnicę trzeba dotrzymać wprost.
 *
 * Zgoda jest jedna dla wszystkich dostawców: dotyczy wysyłania, a nie tego, kto odbiera.
 */
const CONSENT_KEY = 'gemini_consent';

export const hasConsent = (): boolean => getSetting(db, CONSENT_KEY) === 'yes';

export const setConsent = (granted: boolean): void =>
  setSetting(db, CONSENT_KEY, granted ? 'yes' : null);
