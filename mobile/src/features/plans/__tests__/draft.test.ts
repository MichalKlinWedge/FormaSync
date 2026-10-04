import { describe, expect, it } from '@jest/globals';

import {
  addExercises,
  emptyDraft,
  formatDuration,
  formatTarget,
  formatWeight,
  moveItem,
  parseNumber,
  type PlanDraft,
  PlanValidationError,
  removeItem,
  updateItem,
  validateDraft,
} from '../draft';

const squat = { id: 1, name: 'Przysiad', trackingType: 'REPS' as const };
const plank = { id: 2, name: 'Plank', trackingType: 'TIME' as const };
const bench = { id: 3, name: 'Wyciskanie', trackingType: 'REPS' as const };

const draftWith = (...exercises: (typeof squat | typeof plank)[]): PlanDraft => ({
  ...addExercises(emptyDraft('STRENGTH'), exercises),
  title: 'Plan',
});

describe('addExercises', () => {
  it('ustawia domyślne cele zależnie od typu rejestracji', () => {
    const [a, b] = draftWith(squat, plank).items;
    expect(a).toMatchObject({ exerciseId: 1, targetSets: 3, targetReps: 10, targetDurationSeconds: null });
    expect(b).toMatchObject({ exerciseId: 2, targetSets: 3, targetReps: null, targetDurationSeconds: 30 });
    expect(a.key).not.toBe(b.key);
  });

  it('pozwala dodać to samo ćwiczenie dwukrotnie', () => {
    const draft = draftWith(squat, squat);
    expect(draft.items).toHaveLength(2);
    expect(new Set(draft.items.map((i) => i.key)).size).toBe(2);
  });
});

describe('moveItem / removeItem / updateItem', () => {
  it('przesuwa pozycję w górę i w dół, ignoruje wyjście poza zakres', () => {
    const draft = draftWith(squat, plank, bench);
    const [a, b, c] = draft.items;
    const names = (d: PlanDraft) => d.items.map((i) => i.exerciseName);

    expect(names(moveItem(draft, c.key, -1))).toEqual(['Przysiad', 'Wyciskanie', 'Plank']);
    expect(names(moveItem(draft, a.key, 1))).toEqual(['Plank', 'Przysiad', 'Wyciskanie']);
    expect(moveItem(draft, a.key, -1)).toBe(draft);
    expect(names(removeItem(draft, b.key))).toEqual(['Przysiad', 'Wyciskanie']);
  });

  it('aktualizuje tylko wskazaną pozycję', () => {
    const draft = draftWith(squat, bench);
    const updated = updateItem(draft, draft.items[1].key, { targetWeight: 80 });
    expect(updated.items.map((i) => i.targetWeight)).toEqual([null, 80]);
  });
});

describe('validateDraft', () => {
  it('akceptuje poprawny plan', () => {
    expect(() => validateDraft(draftWith(squat, plank))).not.toThrow();
  });

  it.each<[string, (d: PlanDraft) => PlanDraft]>([
    ['brak nazwy', (d) => ({ ...d, title: '  ' })],
    ['brak ćwiczeń', (d) => ({ ...d, items: [] })],
    ['zero serii', (d) => updateItem(d, d.items[0].key, { targetSets: 0 })],
    ['brak powtórzeń', (d) => updateItem(d, d.items[0].key, { targetReps: null })],
    ['brak czasu', (d) => updateItem(d, d.items[1].key, { targetDurationSeconds: null })],
    ['ujemny ciężar', (d) => updateItem(d, d.items[0].key, { targetWeight: -5 })],
  ])('odrzuca: %s', (_, mutate) => {
    expect(() => validateDraft(mutate(draftWith(squat, plank)))).toThrow(PlanValidationError);
  });
});

describe('formatowanie i parsowanie', () => {
  it('parseNumber akceptuje przecinek i pusty tekst', () => {
    expect(parseNumber('62,5')).toBe(62.5);
    expect(parseNumber(' 10 ')).toBe(10);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });

  it('formatuje czas, ciężar i cel serii', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(45)).toBe('0:45');
    expect(formatWeight(62.5)).toBe('62,5');
    expect(formatWeight(100)).toBe('100');
    expect(formatTarget({ targetSets: 3, targetReps: 8, targetWeight: 60, targetDurationSeconds: null })).toBe(
      '3 × 8 · 60 kg',
    );
    expect(formatTarget({ targetSets: 3, targetReps: null, targetWeight: null, targetDurationSeconds: 45 })).toBe(
      '3 × 0:45',
    );
  });
});
