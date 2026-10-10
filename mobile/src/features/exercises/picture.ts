/**
 * Własny obrazek ćwiczenia — podmienia rysunek poglądowy.
 *
 * Przyjmujemy dwa rodzaje adresów: plik skopiowany z galerii do katalogu aplikacji (`file://`)
 * i adres z sieci (`https://`). Pierwszy działa offline, drugi wymaga internetu przy każdym
 * otwarciu — ale za to pozwala wskazać gotową ilustrację bez ściągania jej na telefon.
 */

export class PictureUrlError extends Error {}

export function normalizePictureUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^file:\/\/\S+/i.test(text)) return text;
  if (/^https:\/\/\S+\.\S+/i.test(text)) return text;
  throw new PictureUrlError('Wklej adres obrazka zaczynający się od https:// albo wybierz go z galerii.');
}

/** Czy obrazek leży w telefonie — taki działa bez internetu i to go kasujemy przy podmianie. */
export const isLocalPicture = (url: string | null): boolean => !!url && url.startsWith('file://');
