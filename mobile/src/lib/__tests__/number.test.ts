import { describe, expect, it } from '@jest/globals';

import { formatKg, formatNumber, formatTonnage, plural, pluralWith } from '../number';

const nbsp = ' ';

describe('formatNumber', () => {
  it('grupuje tysiące i używa przecinka dziesiętnego', () => {
    expect(formatNumber(12345)).toBe(`12${nbsp}345`);
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1234567)).toBe(`1${nbsp}234${nbsp}567`);
    expect(formatNumber(12.34, 1)).toBe('12,3');
  });

  it('oznacza wartości ujemne półpauzą', () => {
    expect(formatNumber(-1500)).toBe(`−1${nbsp}500`);
  });
});

describe('formatKg', () => {
  it('pomija zera po przecinku dla liczb całkowitych', () => {
    expect(formatKg(100)).toBe(`100${nbsp}kg`);
    expect(formatKg(62.5)).toBe(`62,5${nbsp}kg`);
  });
});

describe('formatTonnage', () => {
  it('przechodzi na tony powyżej tysiąca', () => {
    expect(formatTonnage(850)).toBe('850');
    expect(formatTonnage(12400)).toBe(`12,4${nbsp}t`);
    expect(formatTonnage(0)).toBe('0');
  });
});

describe('plural', () => {
  it.each([
    [0, 'serii'],
    [1, 'seria'],
    [2, 'serie'],
    [4, 'serie'],
    [5, 'serii'],
    [12, 'serii'],
    [14, 'serii'],
    [22, 'serie'],
    [25, 'serii'],
    // Po polsku formę pojedynczą bierze wyłącznie liczba 1: mówimy „101 serii”.
    [101, 'serii'],
    [102, 'serie'],
  ])('%i → %s', (count, expected) => {
    expect(plural(count, 'seria', 'serie', 'serii')).toBe(expected);
  });

  it('skleja liczbę z rzeczownikiem', () => {
    expect(pluralWith(3, 'seria', 'serie', 'serii')).toBe(`3${nbsp}serie`);
  });
});
