/**
 * Teksty wspólne dla ekranów planu siłowego i wytrzymałościowego — obie wersje tego samego
 * ekranu muszą mówić to samo.
 */

/**
 * Ostrzeżenie przed usunięciem. Przy szablonie dochodzi zdanie o braku powrotu: wbudowane
 * szablony dogrywa seed, więc bez tego można by liczyć, że skasowany wróci po aktualizacji.
 */
export function deleteMessage(isTemplate: boolean, title: string): string {
  const base = `„${title}” oraz jego terminy w kalendarzu. Historia treningów zostanie.`;
  return isTemplate ? `${base} Wbudowany szablon nie wróci przy kolejnej aktualizacji.` : base;
}

/** Nagłówek kreatora — po wejściu z „Edytuj szablon” ekran ma mówić, co się właściwie zmienia. */
export function screenTitle(editing: boolean, isTemplate: boolean): string {
  if (!editing) return 'Nowy plan';
  return isTemplate ? 'Edycja szablonu' : 'Edycja planu';
}

/** Podpis przycisku zapisu — ta sama rzecz, którą nazywa nagłówek. */
export const saveLabel = (isTemplate: boolean): string => (isTemplate ? 'Zapisz szablon' : 'Zapisz plan');
