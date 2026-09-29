import { describe, expect, it } from '@jest/globals';

import { emptyExerciseFilter, type ExerciseListItem, filterExercises, normalizeText, toggleValue } from '../filter';

const item = (overrides: Partial<ExerciseListItem>): ExerciseListItem => ({
  id: 1,
  name: 'Ćwiczenie',
  categoryId: null,
  categoryName: null,
  equipmentId: null,
  equipmentName: null,
  difficultyLevel: null,
  trackingType: 'REPS',
  isCustom: false,
  imageUrl: null,
  secondaryCategoryIds: [],
  ...overrides,
});

const CHEST = 1;
const TRICEPS = 2;
const LEGS = 3;
const BARBELL = 10;
const DUMBBELL = 11;

const items = [
  item({ id: 1, name: 'Wyciskanie sztangi na ławce płaskiej', categoryId: CHEST, secondaryCategoryIds: [TRICEPS], equipmentId: BARBELL, difficultyLevel: 'INTERMEDIATE' }),
  item({ id: 2, name: 'Rozpiętki z hantlami', categoryId: CHEST, equipmentId: DUMBBELL, difficultyLevel: 'BEGINNER' }),
  item({ id: 3, name: 'Przysiad ze sztangą', categoryId: LEGS, equipmentId: BARBELL, difficultyLevel: 'INTERMEDIATE' }),
  item({ id: 4, name: 'Prostowanie ramion na wyciągu', categoryId: TRICEPS, difficultyLevel: 'BEGINNER' }),
];

const ids = (list: ExerciseListItem[]) => list.map((i) => i.id);

describe('normalizeText', () => {
  it('usuwa polskie znaki i wielkość liter', () => {
    expect(normalizeText('  Ławka ŻÓŁĆ Ęą ')).toBe('lawka zolc ea');
  });
});

describe('filterExercises', () => {
  it('bez filtrów zwraca wszystko', () => {
    expect(ids(filterExercises(items, emptyExerciseFilter))).toEqual([1, 2, 3, 4]);
  });

  it('wyszukuje bez polskich znaków i po wielu słowach w dowolnej kolejności', () => {
    expect(ids(filterExercises(items, { ...emptyExerciseFilter, search: 'lawce sztangi' }))).toEqual([1]);
    expect(ids(filterExercises(items, { ...emptyExerciseFilter, search: 'SZTANG' }))).toEqual([1, 3]);
  });

  it('partia mięśniowa uwzględnia partie dodatkowe', () => {
    expect(ids(filterExercises(items, { ...emptyExerciseFilter, categoryIds: [TRICEPS] }))).toEqual([1, 4]);
  });

  it('łączy wartości jednego filtra przez LUB', () => {
    expect(ids(filterExercises(items, { ...emptyExerciseFilter, equipmentIds: [BARBELL, DUMBBELL] }))).toEqual([1, 2, 3]);
  });

  it('łączy różne filtry przez I (kryterium odbioru: dwa filtry naraz)', () => {
    expect(
      ids(filterExercises(items, { ...emptyExerciseFilter, categoryIds: [CHEST], equipmentIds: [BARBELL] })),
    ).toEqual([1]);
    expect(
      ids(filterExercises(items, { ...emptyExerciseFilter, categoryIds: [CHEST], difficultyLevels: ['BEGINNER'] })),
    ).toEqual([2]);
  });

  it('pomija ćwiczenia bez sprzętu przy filtrze sprzętu', () => {
    expect(ids(filterExercises(items, { ...emptyExerciseFilter, equipmentIds: [DUMBBELL] }))).toEqual([2]);
  });
});

describe('toggleValue', () => {
  it('dodaje i usuwa wartość', () => {
    expect(toggleValue([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggleValue([1, 2], 1)).toEqual([2]);
  });
});
