/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  parseBloodPressure,
  parseHeartRateSamples,
  parseHrv,
  parseSleepMinutes,
  parseSummary,
} from '../wellness';

/**
 * API Garmina nie jest dokumentowane, więc parsery mają jedno zadanie: brak pola ma zostawić
 * puste miejsce w dniu, a nie wywrócić całą synchronizację.
 */

describe('parseSummary', () => {
  it('bierze tętno spoczynkowe i kalorie aktywne', () => {
    expect(parseSummary({ restingHeartRate: 48, activeKilocalories: 612 })).toEqual({
      restingHeartRate: 48,
      activeCalories: 612,
    });
  });

  it('zera i braki traktuje jako brak pomiaru, a nie jako zmierzone zero', () => {
    expect(parseSummary({ restingHeartRate: 0, activeKilocalories: null })).toEqual({
      restingHeartRate: null,
      activeCalories: null,
    });
    expect(parseSummary(null)).toEqual({ restingHeartRate: null, activeCalories: null });
    expect(parseSummary({})).toEqual({ restingHeartRate: null, activeCalories: null });
  });
});

describe('parseSleepMinutes', () => {
  it('przelicza sekundy snu na minuty', () => {
    expect(parseSleepMinutes({ dailySleepDTO: { sleepTimeSeconds: 27000 } })).toBe(450);
  });

  it('noc bez zapisu zostaje pusta', () => {
    expect(parseSleepMinutes({ dailySleepDTO: { sleepTimeSeconds: null } })).toBeNull();
    expect(parseSleepMinutes({})).toBeNull();
    expect(parseSleepMinutes(null)).toBeNull();
  });
});

describe('parseHrv', () => {
  it('bierze średnią z nocy', () => {
    expect(parseHrv({ hrvSummary: { lastNightAvg: 42 } })).toBe(42);
  });

  it('brak pomiaru zostaje pusty', () => {
    expect(parseHrv({ hrvSummary: null })).toBeNull();
    expect(parseHrv(null)).toBeNull();
  });
});

describe('parseBloodPressure', () => {
  it('układa pomiary po dniach, biorąc ostatni z dnia', () => {
    const result = parseBloodPressure({
      measurementSummaries: [
        {
          measurements: [
            { systolic: 130, diastolic: 85, measurementTimestampLocal: '2026-10-08T08:10:00.0' },
            { systolic: 124, diastolic: 80, measurementTimestampLocal: '2026-10-08T21:40:00.0' },
            { systolic: 118, diastolic: 76, measurementTimestampLocal: '2026-10-09T07:55:00.0' },
          ],
        },
      ],
    });
    expect(result.get('2026-10-08')).toEqual({ systolic: 124, diastolic: 80 });
    expect(result.get('2026-10-09')).toEqual({ systolic: 118, diastolic: 76 });
  });

  it('pomiar bez kompletu wartości pomija, zamiast zapisywać połowę', () => {
    const result = parseBloodPressure({
      measurementSummaries: [
        {
          measurements: [
            { systolic: 130, diastolic: null, measurementTimestampLocal: '2026-10-08T08:10:00.0' },
            { systolic: 120, diastolic: 78, measurementTimestampLocal: null },
          ],
        },
      ],
    });
    expect(result.size).toBe(0);
  });

  it('pustej odpowiedzi nie uznaje za pomiary', () => {
    expect(parseBloodPressure(null).size).toBe(0);
    expect(parseBloodPressure({ measurementSummaries: [] }).size).toBe(0);
  });
});

describe('parseHeartRateSamples', () => {
  it('zamienia pary [czas, tętno] na próbki', () => {
    const result = parseHeartRateSamples({
      heartRateValues: [
        [Date.parse('2026-10-09T10:00:00.000Z'), 72],
        [Date.parse('2026-10-09T10:02:00.000Z'), 88],
      ],
    });
    expect(result).toEqual([
      { time: '2026-10-09T10:00:00.000Z', beatsPerMinute: 72 },
      { time: '2026-10-09T10:02:00.000Z', beatsPerMinute: 88 },
    ]);
  });

  it('przerwy w zapisie pomija, zamiast liczyć je jako zero', () => {
    // Zegarek zdjęty z nadgarstka daje null, a nie tętno zerowe.
    const result = parseHeartRateSamples({
      heartRateValues: [
        [Date.parse('2026-10-09T10:00:00.000Z'), null],
        [Date.parse('2026-10-09T10:02:00.000Z'), 88],
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].beatsPerMinute).toBe(88);
  });

  it('dzień bez zapisu daje pustą listę', () => {
    expect(parseHeartRateSamples({ heartRateValues: null })).toEqual([]);
    expect(parseHeartRateSamples(null)).toEqual([]);
  });
});
