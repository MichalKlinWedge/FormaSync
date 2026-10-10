import * as SecureStore from 'expo-secure-store';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';

import { normalizeModel } from './models';

/**
 * Klucz do API modelu. Trzymamy go w SecureStore, nie w bazie — baza jedzie w kopii zapasowej,
 * którą przenosisz na komputer, a klucz rozliczany na Twoim koncie nie ma prawa tam trafić.
 *
 * Nazwa modelu to zwykłe ustawienie: Google wycofuje i dokłada warianty, więc musi dać się ją
 * zmienić bez nowej wersji aplikacji.
 */

const KEY = 'gemini_api_key';
export const MODEL_KEY = 'gemini_model';

/** Wariant domyślny. Gdy Google go wycofa, wystarczy wpisać w Ustawieniach inną nazwę. */
export const DEFAULT_MODEL = 'gemini-2.5-flash';

export async function saveApiKey(value: string | null): Promise<void> {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    await SecureStore.deleteItemAsync(KEY).catch(() => {});
    return;
  }
  await SecureStore.setItemAsync(KEY, trimmed);
}

export async function loadApiKey(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw === null || raw.trim() === '' ? null : raw.trim();
  } catch {
    // Nieodczytywalny wpis traktujemy jak brak — użytkownik wklei klucz ponownie.
    return null;
  }
}

export const hasApiKey = async (): Promise<boolean> => (await loadApiKey()) !== null;

/**
 * Nazwa modelu w postaci, jakiej żąda API. Sprowadzamy ją przy odczycie, a nie tylko przy zapisie,
 * bo w ustawieniach może już leżeć nazwa przepisana ze strony Google — i ma zadziałać bez
 * ponownego wpisywania.
 */
export const modelName = (): string =>
  normalizeModel(getSetting(db, MODEL_KEY) ?? '') || DEFAULT_MODEL;

export const saveModelName = (value: string | null): void =>
  setSetting(db, MODEL_KEY, normalizeModel(value ?? '') || null);

/**
 * Zgoda na wysłanie danych do Google. Pytamy raz i zapisujemy, bo to pierwsza rzecz w tej
 * aplikacji, która wypuszcza treningi poza telefon — ekran Prywatności obiecuje, że dane
 * wychodzą tylko tam, gdzie sam je wyślesz, i tę obietnicę trzeba dotrzymać wprost.
 */
const CONSENT_KEY = 'gemini_consent';

export const hasConsent = (): boolean => getSetting(db, CONSENT_KEY) === 'yes';

export const setConsent = (granted: boolean): void =>
  setSetting(db, CONSENT_KEY, granted ? 'yes' : null);
