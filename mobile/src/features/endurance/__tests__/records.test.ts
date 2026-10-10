/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  bestEffort,
  FASTEST_PLAUSIBLE_PACE,
  RECORD_DISTANCES,
  sportRecords,
  type RecordWorkout,
} from '../records';

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

describe('tempo nie z tego świata', () => {
  it('nie uznaje za rekord fragmentu szybszego od rekordzisty świata', () => {
    // Kilometr w 39 sekund to 92 km/h. Taki zapis zostaje po zgubionym sygnale GPS albo
    // po aktywności dopisanej ręcznie — i bez progu zostawał rekordem na zawsze.
    const splits = [{ meters: 1000, seconds: 39 }];
    expect(bestEffort(splits, 1000)).toEqual({ seconds: 39, source: 'WORKOUT' });
    expect(bestEffort(splits, 1000, FASTEST_PLAUSIBLE_PACE.RUNNING)).toBeNull();
  });

  it('jeden zepsuty odcinek nie psuje rekordu z pozostałych', () => {
    const records = sportRecords(
      [
        workout(1, [[1000, 39]]),
        workout(2, [[1000, 252], [1000, 258], [1000, 255]]),
      ],
      'RUNNING',
    );
    const kilometer = records.efforts.find((effort) => effort.meters === 1000);
    // Zamiast 0:39 zostaje najszybszy prawdziwy kilometr z drugiego treningu.
    expect(kilometer).toMatchObject({ seconds: 252, sessionId: 2 });
  });

  it('nie pokazuje też niemożliwego tempa jako najlepszego tempa pracy', () => {
    const records = sportRecords([workout(1, [[1000, 39]]), workout(2, [[5000, 1400]])], 'RUNNING');
    expect(records.bestPace).toMatchObject({ value: 280, sessionId: 2 });
  });

  it('nie ucina tempa realnego, choćby bardzo szybkiego', () => {
    // 2:30/km to tempo światowej czołówki na kilometrze — mieści się w progu.
    expect(bestEffort([{ meters: 1000, seconds: 150 }], 1000, FASTEST_PLAUSIBLE_PACE.RUNNING)).toEqual({
      seconds: 150,
      source: 'WORKOUT',
    });
  });

  it('każda dyscyplina ma własny próg', () => {
    // Setka w 20 sekund to usterka pomiaru, w 50 — rekord świata.
    expect(bestEffort([{ meters: 100, seconds: 20 }], 100, FASTEST_PLAUSIBLE_PACE.SWIMMING)).toBeNull();
    expect(bestEffort([{ meters: 100, seconds: 50 }], 100, FASTEST_PLAUSIBLE_PACE.SWIMMING)).not.toBeNull();
  });
});

describe('odcinek z dystansem bez czasu', () => {
  /** Trening po 5:00/km, w którym jedno okrążenie zgubiło czas. */
  const broken = [
    { meters: 500, seconds: 150 },
    { meters: 1000, seconds: 0 },
    { meters: 500, seconds: 150 },
  ];

  it('nie wchodzi do okna, bo dokładałby metry bez sekund', () => {
    // Przed poprawką wychodziło stąd 1:40/km z danych biegniętych po 5:00/km.
    expect(bestEffort(broken, 1000)).toBeNull();
  });

  it('nie psuje rekordu z odcinków po swoich obu stronach', () => {
    const splits = [
      { meters: 1000, seconds: 300 },
      { meters: 1000, seconds: 0 },
      { meters: 1000, seconds: 282 },
    ];
    expect(bestEffort(splits, 1000)).toEqual({ seconds: 282, source: 'SPLIT' });
  });

  it('przerwa bez dystansu okna nie przerywa', () => {
    const splits = [
      { meters: 1000, seconds: 300 },
      { meters: 0, seconds: 60 },
      { meters: 1000, seconds: 300 },
    ];
    // Dwa kilometry z minutą postoju to 660 s, czyli 330 s/km — i tak to liczymy.
    expect(bestEffort(splits, 2000)).toEqual({ seconds: 660, source: 'WORKOUT' });
  });

  it('mówi, że taki trening pominięto, żeby brak rekordu nie wyglądał na zgubiony', () => {
    const records = sportRecords(
      [workout(1, [[10000, 3300]]), { ...workout(2, [[2000, 300]]), splits: broken }],
      'RUNNING',
    );
    expect(records.skipped).toBe(1);
  });

  it('liczy taki trening w zestawie z pozostałymi, nie wywracając całości', () => {
    const records = sportRecords(
      [workout(1, [[10000, 3300]]), { ...workout(2, [[2000, 300]]), splits: broken }],
      'RUNNING',
    );
    const kilometer = records.efforts.find((effort) => effort.meters === 1000);
    expect(kilometer).toMatchObject({ seconds: 330, sessionId: 1 });
  });
});
