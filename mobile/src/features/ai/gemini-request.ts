/**
 * Kształt jednej wiadomości do Gemini.
 *
 * Osobny moduł, bo klient sięga po klucz do bezpiecznego magazynu telefonu i w teście nie da się
 * go nawet zaimportować — a to, co dokładnie lecisz do Google, jest akurat warte sprawdzenia.
 */

import type { AiImage } from './providers';

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/**
 * Części wiadomości. Zdjęcie idzie **przed** tekstem: model czyta części po kolei, więc polecenie
 * odwołujące się do obrazu („na zdjęciu jest to samo jedzenie”) musi mieć ten obraz już za sobą.
 *
 * Nazwy pól są w stylu REST API Google (`inline_data`, `mime_type`), a nie w camelCase — to ta
 * sama konwencja, której używa reszta zapytania.
 */
export function contentParts(prompt: string, image?: AiImage | null): GeminiPart[] {
  const parts: GeminiPart[] = [];
  if (image !== undefined && image !== null) {
    parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  }
  parts.push({ text: prompt });
  return parts;
}
