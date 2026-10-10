/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  behindAt,
  dayRatio,
  describeDay,
  describeReminder,
  expectedAt,
  formatTime,
  parseTime,
  type DayWindow,
} from '../day';

const WINDOW: DayWindow = { from: '08:00', to: '21:00' };

/** Godzina dzisiejszego dnia w strefie telefonu — kreska dnia jest pojęciem lokalnym. */
const at = (hours: number, minutes = 0) => new Date(2026, 9, 10, hours, minutes);

describe('parseTime', () => {
  it('czyta godzinę z minutami', () => {
    expect(parseTime('08:30')).toBe(510);
    expect(parseTime('0:00')).toBe(0);
  });

  it('odrzuca wszystko, co nie jest godziną', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('08:60')).toBeNull();
    expect(parseTime('osiem')).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
});

describe('formatTime', () => {
  it('składa godzinę z minut od północy', () => {
    expect(formatTime(510)).toBe('08:30');
    expect(formatTime(0)).toBe('00:00');
  });
});

describe('expectedAt', () => {
  it('przed otwarciem okna nie wymaga niczego', () => {
    expect(expectedAt(2600, WINDOW, at(6))).toBe(0);
    expect(expectedAt(2600, WINDOW, at(8))).toBe(0);
  });

  it('w połowie okna wymaga połowy celu', () => {
    // Okno 8:00–21:00 ma trzynaście godzin, więc połowa wypada o 14:30.
    expect(expectedAt(2600, WINDOW, at(14, 30))).toBe(1300);
  });

  it('po zamknięciu okna wymaga całego celu', () => {
    expect(expectedAt(2600, WINDOW, at(21))).toBe(2600);
    expect(expectedAt(2600, WINDOW, at(23))).toBe(2600);
  });

  it('zepsutego okna nie zamienia na żądanie wypicia wszystkiego naraz', () => {
    expect(expectedAt(2600, { from: '21:00', to: '08:00' }, at(14))).toBe(0);
    expect(expectedAt(2600, { from: 'rano', to: 'wieczorem' }, at(14))).toBe(0);
  });
});

describe('behindAt', () => {
  it('liczy, ile brakuje do kreski', () => {
    expect(behindAt(2600, 800, WINDOW, at(14, 30))).toBe(500);
  });

  it('kto jest do przodu, nie ma zaległości', () => {
    expect(behindAt(2600, 1800, WINDOW, at(14, 30))).toBe(0);
  });
});

describe('dayRatio', () => {
  it('przycina wypełnienie paska do zakresu', () => {
    expect(dayRatio(1300, 2600)).toBe(0.5);
    expect(dayRatio(3000, 2600)).toBe(1);
    expect(dayRatio(500, 0)).toBe(0);
  });
});

describe('describeDay', () => {
  it('po dowiezieniu celu nie szuka już zaległości', () => {
    expect(describeDay(2600, 2600, WINDOW, at(14, 30))).toBe('Cel dnia dowieziony.');
  });

  it('kto jest na kresce, słyszy tylko, ile zostało', () => {
    expect(describeDay(1300, 2600, WINDOW, at(14, 30))).toBe('Jesteś na kresce — do celu 1,3 l.');
  });

  it('zaległość podaje osobno od reszty dnia', () => {
    expect(describeDay(800, 2600, WINDOW, at(14, 30))).toBe(
      'Zaległość 500 ml — do celu 1,8 l.',
    );
  });
});

describe('describeReminder', () => {
  it('mówi, ile brakuje teraz i ile zostało do końca dnia', () => {
    expect(describeReminder(500, 1800)).toBe(
      'Brakuje 500 ml do kreski na teraz. Do celu dnia 1,8 l.',
    );
  });
});
