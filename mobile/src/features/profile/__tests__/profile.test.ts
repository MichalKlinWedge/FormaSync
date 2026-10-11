/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { setSetting } from '@/db/settings';
import { createTestDb } from '@/db/test-utils';

import {
  age,
  BirthYearError,
  birthYear,
  estimatedMaxHeartRate,
  HeightError,
  heightCm,
  saveBirthYear,
  saveHeight,
  saveSex,
  sex,
} from '../profile';

describe('rok urodzenia', () => {
  it('wraca z bazy po zapisaniu', () => {
    const db = createTestDb({ seed: true });
    saveBirthYear(db, 1985);
    expect(birthYear(db)).toBe(1985);
  });

  it('bez zapisu nie zgaduje wieku', () => {
    const db = createTestDb({ seed: true });
    expect(birthYear(db)).toBeNull();
    expect(age(db)).toBeNull();
  });

  it('odrzuca rok nie z tego świata', () => {
    const db = createTestDb({ seed: true });
    expect(() => saveBirthYear(db, 1800)).toThrow(BirthYearError);
    expect(() => saveBirthYear(db, 2100)).toThrow(BirthYearError);
    expect(birthYear(db)).toBeNull();
  });

  it('da się wyczyścić', () => {
    const db = createTestDb({ seed: true });
    saveBirthYear(db, 1985);
    saveBirthYear(db, null);
    expect(birthYear(db)).toBeNull();
  });

  it('liczy wiek z roku i dzisiejszej daty', () => {
    const db = createTestDb({ seed: true });
    saveBirthYear(db, 1985);
    expect(age(db, new Date(2026, 5, 1))).toBe(41);
  });

  it('nie wierzy wartości wpisanej poza aplikacją', () => {
    const db = createTestDb({ seed: true });
    // Taki wpis może zostać po ręcznej edycji kopii zapasowej albo po starszej wersji.
    setSetting(db, 'user_birth_year', 'dużo');
    expect(birthYear(db)).toBeNull();
  });
});

describe('płeć i wzrost', () => {
  it('wracają z bazy po zapisaniu', () => {
    const db = createTestDb({ seed: true });
    saveSex(db, 'MALE');
    saveHeight(db, 182);
    expect(sex(db)).toBe('MALE');
    expect(heightCm(db)).toBe(182);
  });

  it('bez zapisu nie zgadują', () => {
    const db = createTestDb({ seed: true });
    expect(sex(db)).toBeNull();
    expect(heightCm(db)).toBeNull();
  });

  it('odrzucają wzrost nie z tego świata', () => {
    const db = createTestDb({ seed: true });
    expect(() => saveHeight(db, 60)).toThrow(HeightError);
    expect(() => saveHeight(db, 300)).toThrow(HeightError);
    expect(heightCm(db)).toBeNull();
  });

  it('dają się wyczyścić', () => {
    const db = createTestDb({ seed: true });
    saveSex(db, 'FEMALE');
    saveHeight(db, 170);
    saveSex(db, null);
    saveHeight(db, null);
    expect(sex(db)).toBeNull();
    expect(heightCm(db)).toBeNull();
  });

  it('nie wierzą wartości wpisanej poza aplikacją', () => {
    const db = createTestDb({ seed: true });
    setSetting(db, 'user_sex', 'tak');
    setSetting(db, 'user_height_cm', 'wysoki');
    expect(sex(db)).toBeNull();
    expect(heightCm(db)).toBeNull();
  });
});

describe('estimatedMaxHeartRate', () => {
  it('liczy ze wzoru 220 minus wiek', () => {
    expect(estimatedMaxHeartRate(41)).toBe(179);
  });
});
