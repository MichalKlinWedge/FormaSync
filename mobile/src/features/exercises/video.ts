/**
 * Film instruktażowy do ćwiczenia.
 *
 * Domyślnie nie trzymamy żadnego konkretnego adresu, tylko otwieramy wyszukiwanie w YouTube po
 * nazwie ćwiczenia. Wpisany na sztywno odnośnik z czasem gnije — film znika, kanał go ukrywa,
 * a aplikacja zostaje z martwym przyciskiem, o czym nikt się nie dowie, dopóki go nie naciśnie.
 * Wyszukiwanie trafia zawsze w aktualne wyniki i działa też dla ćwiczeń dopisanych samodzielnie.
 *
 * Kto ma swój ulubiony film, może go przypiąć — wtedy przycisk otwiera właśnie jego.
 */

const SEARCH = 'https://www.youtube.com/results?search_query=';

/** Wyszukiwanie w YouTube po nazwie ćwiczenia; „technika” odsiewa skróty i składanki. */
export const videoSearchUrl = (name: string): string =>
  `${SEARCH}${encodeURIComponent(`${name.trim()} technika wykonania`)}`;

/** Adres do otwarcia: przypięty film, a gdy go nie ma — wyszukiwanie. */
export const videoUrlFor = (name: string, saved: string | null): string =>
  saved && saved.trim() ? saved.trim() : videoSearchUrl(name);

export class VideoUrlError extends Error {}

/**
 * Sprawdza wklejony adres. Wymagamy `https://`, bo stąd otwieramy przeglądarkę i nie chcemy
 * wpuszczać byle czego; puste pole znaczy „wróć do wyszukiwania”, a nie błąd.
 */
export function normalizeVideoUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (!/^https:\/\/\S+\.\S+/i.test(text)) {
    throw new VideoUrlError('Wklej pełny adres filmu, zaczynający się od https://');
  }
  return text;
}

/** Czy adres prowadzi do YouTube — po tym nazywamy przycisk tym, czym naprawdę jest. */
export function isYouTube(url: string): boolean {
  const host = url.match(/^https:\/\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? '';
  return /(^|\.)(youtube\.com|youtu\.be)$/.test(host);
}

/** Podpis przycisku filmu. */
export const videoLabel = (saved: string | null): string =>
  saved === null ? 'Szukaj filmu na YouTube' : isYouTube(saved) ? 'Obejrzyj na YouTube' : 'Obejrzyj film';
