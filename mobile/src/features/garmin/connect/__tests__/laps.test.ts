/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { activityNumber, lapsMatchTotal, parseLaps } from '../laps';

describe('parseLaps', () => {
  it('czyta okrążenia biegu z lapDTOs', () => {
    const laps = parseLaps({
      lapDTOs: [
        { distance: 1000.4, duration: 300.6, averageHR: 148.2 },
        { distance: 1000, duration: 294, averageHR: 156 },
      ],
    });
    expect(laps).toEqual([
      { meters: 1000.4, seconds: 301, avgHeartRate: 148 },
      { meters: 1000, seconds: 294, avgHeartRate: 156 },
    ]);
  });

  it('czyta długości basenu z lengthDTOs', () => {
    const laps = parseLaps({
      lengthDTOs: [
        { distance: 50, duration: 58 },
        { distance: 50, duration: 55 },
      ],
    });
    expect(laps).toHaveLength(2);
    expect(laps[1]).toEqual({ meters: 50, seconds: 55, avgHeartRate: null });
  });

  it('przyjmuje odpowiedź podaną wprost jako tablica', () => {
    const laps = parseLaps([
      { distance: 400, duration: 90 },
      { distance: 400, duration: 88 },
    ]);
    expect(laps).toHaveLength(2);
  });

  it('bierze czas zapasowy, gdy nie podano duration', () => {
    const laps = parseLaps([
      { distance: 500, movingDuration: 120 },
      { distance: 500, elapsedDuration: 130 },
    ]);
    expect(laps.map((lap) => lap.seconds)).toEqual([120, 130]);
  });

  it('odrzuca pojedyncze okrążenie, bo to po prostu cała aktywność', () => {
    expect(parseLaps({ lapDTOs: [{ distance: 5000, duration: 1500 }] })).toEqual([]);
  });

  it('pomija okrążenia bez dystansu i bez czasu', () => {
    const laps = parseLaps([
      { distance: 1000, duration: 300 },
      { distance: 0, duration: 0 },
      { distance: 1000, duration: 290 },
    ]);
    expect(laps).toHaveLength(2);
  });

  it('nie wywraca się na pustej ani nieznanej odpowiedzi', () => {
    expect(parseLaps(null)).toEqual([]);
    expect(parseLaps({})).toEqual([]);
    expect(parseLaps({ lapDTOs: null })).toEqual([]);
  });
});

describe('lapsMatchTotal', () => {
  const laps = [
    { meters: 2500, seconds: 750, avgHeartRate: null },
    { meters: 2500, seconds: 740, avgHeartRate: null },
  ];

  it('przyjmuje podział zgodny z dystansem treningu', () => {
    expect(lapsMatchTotal(laps, 5000)).toBe(true);
    // Garmin podaje metry z ułamkami, więc drobna różnica nie dyskwalifikuje podziału.
    expect(lapsMatchTotal(laps, 5050)).toBe(true);
  });

  it('odrzuca podział, który zmieniłby dystans treningu', () => {
    expect(lapsMatchTotal(laps, 8000)).toBe(false);
  });

  it('bez dystansu w podsumowaniu nie ma czego sprawdzać', () => {
    expect(lapsMatchTotal(laps, null)).toBe(true);
  });

  it('brak okrążeń to nie zgodność', () => {
    expect(lapsMatchTotal([], 5000)).toBe(false);
    expect(lapsMatchTotal([], null)).toBe(false);
  });
});

describe('activityNumber', () => {
  it('wyłuskuje numer aktywności z identyfikatora', () => {
    expect(activityNumber('garmin:20784512345')).toBe('20784512345');
  });

  it('nie zgaduje numeru dla identyfikatorów sprzed Garmina', () => {
    // Takie wpisy zostały po wczytywaniu przez Health Connect.
    expect(activityNumber('rec-1')).toBeNull();
    expect(activityNumber('garmin:abc')).toBeNull();
  });
});
