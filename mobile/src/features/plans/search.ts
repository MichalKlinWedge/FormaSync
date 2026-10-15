import { normalizeText } from '@/features/exercises/filter';

/**
 * Szukanie planu po fragmencie nazwy.
 *
 * Lista planów rośnie z każdym celem i każdym szablonem — przy stu kilkudziesięciu nazwach wybór
 * z kafelków przestaje być wyborem, a staje się przewijaniem. Dopasowanie jest takie samo jak
 * w ćwiczeniach: bez wielkości liter i bez polskich znaków, więc „interwaly” znajdzie
 * „Interwały”, a każde słowo zapytania musi wystąpić — „dlugi 16” zawęzi do jednej jednostki.
 *
 * Szukamy też w opisie: plany pod cel mają w nazwie sam dystans, a to, czym są, piszą właśnie tam.
 *
 * I w nazwach ćwiczeń, bo plan najczęściej szuka się po tym, co w nim jest: „martwy ciąg” pamięta
 * się lepiej niż „PPL — Pull siłownia”. Jedno pole zamiast trzech, bo to jedno pytanie — „gdzie to
 * było” — a nie trzy osobne. Lista ćwiczeń jest opcjonalna: ekran, który jej nie ma, szuka jak
 * dotąd, zamiast nie znajdować niczego.
 */

export type SearchablePlan = {
  title: string;
  description: string | null;
  exercises?: readonly string[];
};

export function matchesSearch(plan: SearchablePlan, search: string): boolean {
  const words = normalizeText(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(
    `${plan.title} ${plan.description ?? ''} ${(plan.exercises ?? []).join(' ')}`,
  );
  return words.every((word) => haystack.includes(word));
}

export const searchPlans = <T extends SearchablePlan>(plans: T[], search: string): T[] =>
  plans.filter((plan) => matchesSearch(plan, search));
