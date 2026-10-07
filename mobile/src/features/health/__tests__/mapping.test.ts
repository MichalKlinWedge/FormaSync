import { describe, expect, it } from '@jest/globals';

import {
  caloriesInWindow,
  dayKeysBetween,
  latestOfDay,
  metersInWindow,
  sleepMinutesForDay,
  summarizeHeartRate,
} from '../mapping';

const at = (h: number, m = 0) => new Date(2026, 9, 1, h, m).toISOString();

describe('summarizeHeartRate', () => {
  it('liczy średnią i maksimum tylko z próbek w oknie sesji', () => {
    const samples = [
      { time: at(9, 59), beatsPerMinute: 200 }, // przed sesją
      { time: at(10, 5), beatsPerMinute: 120 },
      { time: at(10, 30), beatsPerMinute: 150 },
      { time: at(11, 1), beatsPerMinute: 190 }, // po sesji
    ];
    expect(summarizeHeartRate(samples, at(10), at(11))).toEqual({ avgHeartRate: 135, maxHeartRate: 150 });
  });

  it('zwraca puste wartości, gdy nic nie pasuje', () => {
    expect(summarizeHeartRate([], at(10), at(11))).toEqual({ avgHeartRate: null, maxHeartRate: null });
    expect(summarizeHeartRate([{ time: at(8), beatsPerMinute: 100 }], at(10), at(11))).toEqual({
      avgHeartRate: null,
      maxHeartRate: null,
    });
  });
});

describe('caloriesInWindow', () => {
  it('bierze część kalorii proporcjonalną do nałożenia okresów', () => {
    // Blok 10:00–11:00 z 60 kcal; sesja 10:30–11:30 pokrywa połowę bloku.
    const records = [{ startTime: at(10), endTime: at(11), origin: 'zegarek', kilocalories: 60 }];
    expect(caloriesInWindow(records, at(10, 30), at(11, 30))).toBe(30);
  });

  it('sumuje kilka bloków i pomija nienachodzące', () => {
    const records = [
      { startTime: at(10), endTime: at(10, 30), origin: 'zegarek', kilocalories: 30 },
      { startTime: at(10, 30), endTime: at(11), origin: 'zegarek', kilocalories: 40 },
      { startTime: at(14), endTime: at(15), origin: 'zegarek', kilocalories: 99 },
    ];
    expect(caloriesInWindow(records, at(10), at(11))).toBe(70);
  });

  it('zwraca null, gdy żaden blok nie pasuje', () => {
    expect(caloriesInWindow([], at(10), at(11))).toBeNull();
    expect(
      caloriesInWindow([{ startTime: at(14), endTime: at(15), origin: 'zegarek', kilocalories: 50 }], at(10), at(11)),
    ).toBeNull();
  });
});

describe('sleepMinutesForDay', () => {
  it('sumuje sesje snu kończące się danego dnia', () => {
    const sessions = [
      { startTime: new Date(2026, 8, 30, 23, 0).toISOString(), endTime: new Date(2026, 9, 1, 6, 30).toISOString() },
      { startTime: new Date(2026, 9, 1, 13, 0).toISOString(), endTime: new Date(2026, 9, 1, 13, 30).toISOString() },
    ];
    // Sen nocny liczy się do dnia przebudzenia: 7,5 h + 30 min drzemki.
    expect(sleepMinutesForDay(sessions, '2026-10-01')).toBe(450 + 30);
  });

  it('zwraca null, gdy nie ma snu w tym dniu', () => {
    expect(sleepMinutesForDay([], '2026-10-01')).toBeNull();
  });
});

describe('latestOfDay', () => {
  it('wybiera ostatni odczyt dnia', () => {
    const records = [
      { time: at(7), beatsPerMinute: 52 },
      { time: at(22), beatsPerMinute: 48 },
      { time: new Date(2026, 9, 2, 7).toISOString(), beatsPerMinute: 60 },
    ];
    expect(latestOfDay(records, '2026-10-01')?.beatsPerMinute).toBe(48);
    expect(latestOfDay(records, '2026-10-03')).toBeNull();
  });
});

describe('dayKeysBetween', () => {
  it('wypisuje dni włącznie i przechodzi przez granicę miesiąca', () => {
    expect(dayKeysBetween(new Date(2026, 8, 29), new Date(2026, 9, 2))).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(dayKeysBetween(new Date(2026, 9, 1), new Date(2026, 9, 1))).toEqual(['2026-10-01']);
  });
});

describe('dystans z dwóch programów naraz', () => {
  const run = [at(13, 20), at(14, 9)] as const;

  it('bierze większe źródło, a nie sumę obu', () => {
    // Prawdziwy przypadek: bieg na 10 009 m z zegarka i 7 641 m doliczone z kroków telefonu.
    // Sumowanie dawało 17 650 m — dystans, którego nikt nie przebiegł.
    const records = [
      { startTime: run[0], endTime: run[1], origin: 'com.garmin.android.apps.connectmobile', meters: 10009 },
      { startTime: run[0], endTime: run[1], origin: 'com.sec.android.app.shealth', meters: 7641 },
    ];
    expect(metersInWindow(records, run[0], run[1])).toBe(10009);
  });

  it('wewnątrz jednego źródła nadal sumuje — to kolejne odcinki tej samej trasy', () => {
    const records = [
      { startTime: at(13, 20), endTime: at(13, 45), origin: 'zegarek', meters: 5000 },
      { startTime: at(13, 45), endTime: at(14, 9), origin: 'zegarek', meters: 5009 },
    ];
    expect(metersInWindow(records, run[0], run[1])).toBe(10009);
  });

  it('jedno źródło działa jak dotąd', () => {
    const records = [{ startTime: run[0], endTime: run[1], origin: 'zegarek', meters: 10009 }];
    expect(metersInWindow(records, run[0], run[1])).toBe(10009);
  });

  it('bez żadnego zapisu — null', () => {
    expect(metersInWindow([], run[0], run[1])).toBeNull();
  });
});
