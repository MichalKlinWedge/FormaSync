import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';

import { type AiModel, normalizeModel } from './models';
import type { Provider } from './providers';

/**
 * Modele, których ten klucz nie obsłuży.
 *
 * Lista od dostawcy jest szersza niż to, czym można zapytać: wariant wycofany „dla nowych
 * użytkowników” nadal się na niej pokazuje, a odpowiada dopiero odmową przy pierwszym zapytaniu.
 * Z góry nie da się tego sprawdzić inaczej niż zapytaniem, więc uczymy się z odmów: raz odrzucony
 * model znika z wyboru, żeby nie wracał co tydzień jako kuszący nowy wariant.
 *
 * Pamięć jest związana z kluczem — przy zapisie nowego zaczynamy od zera, bo inne konto bywa
 * uprawnione do czegoś innego.
 */

const KEYS: Record<Provider, string> = {
  GEMINI: 'gemini_rejected_models',
  CLAUDE: 'claude_rejected_models',
  OPENAI: 'openai_rejected_models',
};

/** Identyfikatory odrzucone przez dostawcę dla zapisanego klucza. */
export function rejectedModels(provider: Provider): string[] {
  const raw = getSetting(db, KEYS[provider]) ?? '';
  return raw
    .split(',')
    .map((entry) => normalizeModel(entry))
    .filter((entry) => entry !== '');
}

/** Zapamiętuje odmowę. Powtórzona nic nie zmienia, więc i nie zapisujemy jej drugi raz. */
export function rememberRejected(provider: Provider, model: string): void {
  const id = normalizeModel(model);
  if (id === '') return;

  const known = rejectedModels(provider);
  if (known.includes(id)) return;
  setSetting(db, KEYS[provider], [...known, id].join(','));
}

/** Zapomina odmowy — po zmianie klucza i wtedy, gdy ktoś chce zobaczyć pełną listę. */
export function forgetRejected(provider: Provider): void {
  setSetting(db, KEYS[provider], null);
}

/** Lista bez tego, co ten klucz już odrzucił. */
export function withoutRejected(provider: Provider, models: AiModel[]): AiModel[] {
  const gone = rejectedModels(provider);
  return models.filter((model) => !gone.includes(model.id));
}
