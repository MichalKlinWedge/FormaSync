import { describe, expect, it } from '@jest/globals';

import {
  alreadySettled,
  describeLapBackfill,
  describeRefresh,
  findOverlappingSession,
  inventory,
  sameMoment,
  selectImportable,
  type WatchActivity,
} from '../mapping';

const make = (recordId: string, startTime: string, endTime = startTime): WatchActivity => ({
  recordId,
  title: 'Trening',
  sport: 'OTHER',
  startTime,
  endTime,
  durationSeconds: 0,
  distanceMeters: null,
  avgHeartRate: null,
  maxHeartRate: null,
  caloriesBurned: null,
});

describe('selectImportable', () => {
  it('pomija już wczytane i układa od najnowszej', () => {
    const result = selectImportable(
      [
        make('a', '2026-10-01T10:00:00.000Z'),
        make('b', '2026-10-03T10:00:00.000Z'),
        make('c', '2026-10-02T10:00:00.000Z'),
      ],
      new Set(['c']),
      new Set(),
      [],
    );
    expect(result.map((item) => item.recordId)).toEqual(['b', 'a']);
  });

  it('pomija odłożone', () => {
    const result = selectImportable([make('a', '2026-10-01T10:00:00.000Z')], new Set(), new Set(['a']), []);
    expect(result).toEqual([]);
  });

  it('pokrywającej się aktywności nie ukrywa, tylko podpowiada trening do połączenia', () => {
    const result = selectImportable(
      [make('a', '2026-10-01T10:00:00.000Z', '2026-10-01T10:45:00.000Z')],
      new Set(),
      new Set(),
      [
        {
          id: 7,
          title: 'Nogi',
          startTime: '2026-10-01T09:30:00.000Z',
          endTime: '2026-10-01T11:00:00.000Z',
          linked: false,
        },
      ],
    );
    expect(result).toHaveLength(1);
    expect(result[0].matchingSession?.id).toBe(7);
  });

  it('bez pokrycia nie podpowiada żadnego treningu', () => {
    const result = selectImportable([make('a', '2026-10-01T10:00:00.000Z')], new Set(), new Set(), []);
    expect(result[0].matchingSession).toBeNull();
  });
});

describe('findOverlappingSession', () => {
  it('trening kończący się przed początkiem aktywności to nie ta sama rzecz', () => {
    const result = findOverlappingSession(
      { startTime: '2026-10-01T10:00:00.000Z', endTime: '2026-10-01T11:00:00.000Z' },
      [
        {
          id: 1,
          title: 'Rano',
          startTime: '2026-10-01T08:00:00.000Z',
          endTime: '2026-10-01T09:00:00.000Z',
          linked: false,
        },
      ],
    );
    expect(result).toBeNull();
  });
});

describe('describeLapBackfill', () => {
  /** `pluralWith` spaja liczbę z rzeczownikiem spacją nierozdzielającą. */
  const n = (count: number, noun: string) => `${count} ${noun}`;

  it('mówi, do ilu treningów okrążenia doszły', () => {
    expect(describeLapBackfill({ candidates: 4, filled: 4, laps: 37 })).toBe(
      `Okrążenia doszły do 4 z 4: razem ${n(37, 'okrążeń')}.`,
    );
  });

  it('nie przemilcza treningów, których Garmin nie podzielił', () => {
    expect(describeLapBackfill({ candidates: 5, filled: 2, laps: 18 })).toBe(
      `Okrążenia doszły do 2 z 5: razem ${n(18, 'okrążeń')}. Dla pozostałych ${n(3, 'treningów')} Garmin okrążeń nie ma.`,
    );
  });

  it('po pustym przebiegu mówi, że rekordy zostają ze średnich', () => {
    expect(describeLapBackfill({ candidates: 3, filled: 0, laps: 0 })).toBe(
      `Garmin nie podał okrążeń dla żadnego z ${n(3, 'treningów')}. Rekordy zostają liczone ze średnich.`,
    );
  });

  it('bez kandydatów nie udaje, że coś zrobił', () => {
    expect(describeLapBackfill({ candidates: 0, filled: 0, laps: 0 })).toBe(
      'Wszystkie treningi z zegarka mają już okrążenia.',
    );
  });
});

describe('describeRefresh', () => {
  it('liczy to, co dopiero doszło', () => {
    expect(describeRefresh(2, 5)).toBe('Nowe treningi: 2.');
  });

  it('po pustym pobraniu przypomina, co jeszcze czeka', () => {
    expect(describeRefresh(0, 3)).toBe('Nic nowego nie doszło. Na liście czeka 3.');
  });

  it('przy zerze wskazuje synchronizację zegarka, bo to ona wnosi treningi do Garmina', () => {
    expect(describeRefresh(0, 0)).toContain('zsynchronizuj zegarek');
  });
});

describe('inventory', () => {
  it('wymienia także to, co lista do wczytania pomija', () => {
    // O to w spisie chodzi: brak treningu na liście ma dwie różne przyczyny i trzeba je rozróżnić.
    const result = inventory(
      [
        make('nowy', '2026-10-01T10:00:00.000Z'),
        make('wczytany', '2026-10-02T10:00:00.000Z'),
        make('odlozony', '2026-10-03T10:00:00.000Z'),
      ],
      new Set(['wczytany']),
      new Set(['odlozony']),
    );
    expect(result.map((item) => [item.recordId, item.status])).toEqual([
      ['odlozony', 'ARCHIVED'],
      ['wczytany', 'IMPORTED'],
      ['nowy', 'NEW'],
    ]);
  });

  it('czego Garmin nie zwrócił, tego nie wymyśla', () => {
    expect(inventory([], new Set(['wczytany']), new Set())).toEqual([]);
  });

  it('wczytanie liczy się przed odłożeniem, bo trening jest już w historii', () => {
    const result = inventory([make('a', '2026-10-01T10:00:00.000Z')], new Set(['a']), new Set(['a']));
    expect(result[0].status).toBe('IMPORTED');
  });
});

describe('alreadySettled', () => {
  const window = (over: { startTime: string; endTime: string; linked: boolean }) => ({
    id: 1,
    title: 'Nogi',
    ...over,
  });

  it('aktywnosc pokrywajaca sie z treningiem majacym pomiary uznaje za rozliczona', () => {
    // Dopoki treningi szly przez Health Connect, zapisywaly sie z innym identyfikatorem.
    // Bez tego caly wczytany miesiac wrocilby na liste jako nowy.
    const result = alreadySettled(
      [make('garmin:1', '2026-10-01T10:00:00.000Z', '2026-10-01T11:00:00.000Z')],
      [
        window({
          startTime: '2026-10-01T10:02:00.000Z',
          endTime: '2026-10-01T10:58:00.000Z',
          linked: true,
        }),
      ],
    );
    expect([...result]).toEqual(['garmin:1']);
  });

  it('treningu bez pomiarow nie liczy jako rozliczenia, bo to kandydat do polaczenia', () => {
    const result = alreadySettled(
      [make('garmin:1', '2026-10-01T10:00:00.000Z', '2026-10-01T11:00:00.000Z')],
      [
        window({
          startTime: '2026-10-01T10:02:00.000Z',
          endTime: '2026-10-01T10:58:00.000Z',
          linked: false,
        }),
      ],
    );
    expect(result.size).toBe(0);
  });

  it('aktywnosci z innego dnia nie rusza', () => {
    const result = alreadySettled(
      [make('garmin:1', '2026-10-05T10:00:00.000Z', '2026-10-05T11:00:00.000Z')],
      [
        window({
          startTime: '2026-10-01T10:00:00.000Z',
          endTime: '2026-10-01T11:00:00.000Z',
          linked: true,
        }),
      ],
    );
    expect(result.size).toBe(0);
  });
});

describe('sameMoment', () => {
  it('poznaje tę samą aktywność po czasie startu, mimo innego identyfikatora', () => {
    // Odłożone wpisy mają identyfikatory z czasów, gdy treningi szły przez Health Connect.
    const result = sameMoment(
      [
        make('garmin:1', '2026-10-02T14:08:30.000Z'),
        make('garmin:2', '2026-10-03T09:56:00.000Z'),
      ],
      [{ startTime: '2026-10-02T14:08:00.000Z' }],
    );
    expect([...result]).toEqual(['garmin:1']);
  });

  it('dwie minuty to wciąż ten sam trening, pół godziny już nie', () => {
    const known = [{ startTime: '2026-10-02T14:00:00.000Z' }];
    expect(sameMoment([make('a', '2026-10-02T14:01:30.000Z')], known).size).toBe(1);
    expect(sameMoment([make('a', '2026-10-02T14:30:00.000Z')], known).size).toBe(0);
  });

  it('bez znanych wpisów nie uznaje niczego za znane', () => {
    expect(sameMoment([make('a', '2026-10-02T14:00:00.000Z')], []).size).toBe(0);
  });
});
