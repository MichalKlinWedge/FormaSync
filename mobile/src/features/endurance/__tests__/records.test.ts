/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { bestEffort, RECORD_DISTANCES, sportRecords, type RecordWorkout } from '../records';

/** Trening złożony z podanych odcinków; sumy i tempa liczymy tak jak statystyki. */
function workout(sessionId: number, splits: [number, number][]): RecordWorkout {
  const meters = splits.reduce((sum, [distance]) => sum + distance, 0);
  const seconds = splits.reduce((sum, [, time]) => sum + time, 0);
  const pace = Math.round(seconds / (meters / 1000));
  return {
    sessionId,
    title: `Trening ${sessionId}`,
    startTime: `2026-10-0${sessionId}T06:00:00.000Z`,
    meters,
    seconds,
    pace,
    workPace: pace,
    splits: splits.map(([distance, time]) => ({ meters: distance, seconds: time })),
  };
}

describe('bestEffort', () => {
  it('bierze średnią całego treningu, gdy odcinek jest tylko jeden', () => {
    expect(bestEffort([{ meters: 1000, seconds: 300 }], 1000)).toEqual({
      seconds: 300,
      source: 'WORKOUT',
    });
  });

  it('przelicza czas proporcjonalnie, gdy odcinek jest dłuższy od rekordowego dystansu', () => {
    expect(bestEffort([{ meters: 1500, seconds: 450 }], 1000)).toEqual({
      seconds: 300,
      source: 'WORKOUT',
    });
  });

  it('wybiera najszybszy fragment, a nie średnią całości', () => {
    const splits = [
      { meters: 1000, seconds: 320 },
      { meters: 1000, seconds: 300 },
      { meters: 1000, seconds: 310 },
    ];
    expect(bestEffort(splits, 1000)).toEqual({ seconds: 300, source: 'SPLIT' });
    // Dwa kolejne kilometry: 300 + 310 jest szybsze niż 320 + 300.
    expect(bestEffort(splits, 2000)).toEqual({ seconds: 610, source: 'SPLIT' });
  });

  it('podpisuje rekord jako średnią treningu, gdy okno objęło całość', () => {
    const splits = [
      { meters: 1000, seconds: 320 },
      { meters: 1000, seconds: 300 },
    ];
    expect(bestEffort(splits, 2000)).toEqual({ seconds: 620, source: 'WORKOUT' });
  });

  it('trzyma okno najkrótsze z możliwych', () => {
    // Wolny kilometr z przodu nie ma prawa wejść do rekordu na kilometrze.
    const splits = [
      { meters: 1000, seconds: 600 },
      { meters: 1000, seconds: 300 },
    ];
    expect(bestEffort(splits, 1000)).toEqual({ seconds: 300, source: 'SPLIT' });
  });

  it('liczy przerwę jako czas bez dystansu', () => {
    const splits = [
      { meters: 1000, seconds: 300 },
      { meters: 0, seconds: 120 },
      { meters: 1000, seconds: 300 },
    ];
    // Dwa kilometry z postojem w środku to 720 s, a nie 600 — i słusznie nie jest to rekord.
    expect(bestEffort(splits, 2000)).toEqual({ seconds: 720, source: 'WORKOUT' });
    expect(bestEffort(splits, 1000)).toEqual({ seconds: 300, source: 'SPLIT' });
  });

  it('nie zwraca rekordu z dystansu, którego nie pokonano', () => {
    expect(bestEffort([{ meters: 900, seconds: 300 }], 1000)).toBeNull();
    expect(bestEffort([], 1000)).toBeNull();
  });

  it('pomija odcinki bez zmierzonego czasu', () => {
    expect(bestEffort([{ meters: 1200, seconds: 0 }], 1000)).toBeNull();
  });
});

describe('sportRecords', () => {
  it('zbiera najlepszy czas na każdym dystansie z całej historii', () => {
    const records = sportRecords(
      [workout(1, [[5000, 1500]]), workout(2, [[1000, 240], [4000, 1200]])],
      'RUNNING',
    );

    const kilometer = records.efforts.find((effort) => effort.meters === 1000);
    expect(kilometer).toMatchObject({ seconds: 240, source: 'SPLIT', sessionId: 2 });

    const five = records.efforts.find((effort) => effort.meters === 5000);
    expect(five).toMatchObject({ seconds: 1440, source: 'WORKOUT', sessionId: 2 });
  });

  it('pomija dystanse, których nikt nie pokonał', () => {
    const records = sportRecords([workout(1, [[3000, 900]])], 'RUNNING');
    expect(records.efforts.map((effort) => effort.meters)).toEqual([1000]);
  });

  it('wskazuje najdłuższy dystans, najdłuższy trening i najlepsze tempo', () => {
    const records = sportRecords(
      [workout(1, [[8000, 2400]]), workout(2, [[5000, 1400]])],
      'RUNNING',
    );

    expect(records.longestDistance).toMatchObject({ value: 8000, sessionId: 1 });
    expect(records.longestTime).toMatchObject({ value: 2400, sessionId: 1 });
    expect(records.bestPace).toMatchObject({ value: 280, sessionId: 2 });
  });

  it('dla „Różnych” zostawia tylko rekord czasu — kilometrów tam nie ma', () => {
    const records = sportRecords([{ ...workout(1, [[0, 3600]]), pace: null, workPace: null }], 'OTHER');
    expect(records.efforts).toEqual([]);
    expect(records.longestTime).toMatchObject({ value: 3600 });
    expect(records.longestDistance).toBeNull();
    expect(records.bestPace).toBeNull();
  });

  it('ma osobne dystanse dla pływania, biegania i roweru', () => {
    expect(RECORD_DISTANCES.SWIMMING[0]).toBe(100);
    expect(RECORD_DISTANCES.RUNNING[0]).toBe(1000);
    expect(RECORD_DISTANCES.CYCLING[0]).toBe(10000);
  });

  it('liczy rekordy pływackie z długości basenu', () => {
    const records = sportRecords(
      [workout(1, [[50, 60], [50, 55], [50, 58], [50, 57]])],
      'SWIMMING',
    );
    const hundred = records.efforts.find((effort) => effort.meters === 100);
    // Najszybsza setka to dwie najszybsze kolejne pięćdziesiątki: 55 + 58.
    expect(hundred).toMatchObject({ seconds: 113, source: 'SPLIT' });
  });
});
