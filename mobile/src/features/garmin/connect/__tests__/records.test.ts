/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { createTestDb } from '@/db/test-utils';
import { listGarminRecords, saveGarminRecords } from '@/features/garmin/records-store';

import { parseGarminRecords, recordKeyOf } from '../records';

describe('recordKeyOf', () => {
  it('rozpoznaje rodzaj po etykiecie', () => {
    expect(recordKeyOf({ prTypeLabelKey: 'personal_record_5k' })).toBe('DIST_5K');
    expect(recordKeyOf({ prTypeLabelKey: 'personal_record_10k' })).toBe('DIST_10K');
    expect(recordKeyOf({ prTypeLabelKey: 'personal_record_half_marathon' })).toBe('DIST_HALF');
    expect(recordKeyOf({ prTypeLabelKey: 'personal_record_marathon' })).toBe('DIST_MARATHON');
    expect(recordKeyOf({ prTypeLabelKey: 'personal_record_longest_run' })).toBe('LONGEST_RUN');
  });

  it('nie myli kilometra z dziesiątką', () => {
    expect(recordKeyOf({ prTypeLabelKey: 'personal_record_1k' })).toBe('DIST_1K');
    expect(recordKeyOf({ prTypeLabelKey: 'personal_record_10k' })).not.toBe('DIST_1K');
  });

  it('nie myli maratonu z półmaratonem', () => {
    expect(recordKeyOf({ prTypeLabelKey: 'half_marathon_pr' })).toBe('DIST_HALF');
  });

  it('bez etykiety sięga po numer typu', () => {
    expect(recordKeyOf({ typeId: 3 })).toBe('DIST_5K');
    expect(recordKeyOf({ typeId: 99 })).toBeNull();
  });

  it('etykieta o czymś nieobsługiwanym nie każe zgadywać z numeru', () => {
    // Inaczej rekord rowerowy wylądowałby na liście biegowej pod nazwą dystansu biegowego.
    expect(recordKeyOf({ prTypeLabelKey: 'personal_record_longest_ride', typeId: 3 })).toBeNull();
  });

  it('bez etykiety i bez numeru nie zwraca nic', () => {
    expect(recordKeyOf({})).toBeNull();
  });
});

describe('parseGarminRecords', () => {
  it('czyta rekord czasowy razem z datą', () => {
    const records = parseGarminRecords([
      { prTypeLabelKey: 'personal_record_5k', value: 1320, prStartTimeGmtFormatted: '2026-05-12 08:14:00' },
    ]);
    expect(records).toEqual([
      {
        recordKey: 'DIST_5K',
        label: '5 km',
        distanceMeters: 5000,
        seconds: 1320,
        achievedOn: '2026-05-12',
      },
    ]);
  });

  it('w najdłuższym biegu wartością jest dystans, nie czas', () => {
    const [record] = parseGarminRecords([
      { prTypeLabelKey: 'personal_record_longest_run', value: 24500 },
    ]);
    expect(record).toMatchObject({ distanceMeters: 24500, seconds: null });
  });

  it('odrzuca wartość poza zdrowym zakresem', () => {
    // Pięć kilometrów w 90 sekund to nie rekord, tylko inne znaczenie pola.
    expect(parseGarminRecords([{ prTypeLabelKey: 'personal_record_5k', value: 90 }])).toEqual([]);
    expect(parseGarminRecords([{ prTypeLabelKey: 'personal_record_5k', value: 99999 }])).toEqual([]);
  });

  it('z kilku wpisów tego samego rodzaju bierze lepszy', () => {
    const [record] = parseGarminRecords([
      { prTypeLabelKey: 'personal_record_5k', value: 1380 },
      { prTypeLabelKey: 'personal_record_5k', value: 1320 },
    ]);
    expect(record.seconds).toBe(1320);
  });

  it('w rekordzie dystansowym lepszy znaczy dłuższy', () => {
    const [record] = parseGarminRecords([
      { prTypeLabelKey: 'personal_record_longest_run', value: 18000 },
      { prTypeLabelKey: 'personal_record_longest_run', value: 24500 },
    ]);
    expect(record.distanceMeters).toBe(24500);
  });

  it('nie wywraca się na pustej ani niekompletnej odpowiedzi', () => {
    expect(parseGarminRecords(null)).toEqual([]);
    expect(parseGarminRecords([])).toEqual([]);
    expect(parseGarminRecords([{ prTypeLabelKey: 'personal_record_5k' }])).toEqual([]);
    expect(parseGarminRecords([{ value: 1320 }])).toEqual([]);
  });

  it('bez daty zostawia puste miejsce, a nie dzisiejszy dzień', () => {
    const [record] = parseGarminRecords([{ prTypeLabelKey: 'personal_record_5k', value: 1320 }]);
    expect(record.achievedOn).toBeNull();
  });
});

describe('zapis rekordów', () => {
  const records = [
    { recordKey: 'DIST_5K' as const, label: '5 km', distanceMeters: 5000, seconds: 1320, achievedOn: '2026-05-12' },
    { recordKey: 'DIST_1K' as const, label: '1 km', distanceMeters: 1000, seconds: 240, achievedOn: null },
  ];

  it('wraca z bazy w kolejności od najkrótszego dystansu', () => {
    const db = createTestDb({ seed: true });
    expect(saveGarminRecords(db, records)).toBe(2);
    expect(listGarminRecords(db, 'RUNNING').map((record) => record.recordKey)).toEqual([
      'DIST_1K',
      'DIST_5K',
    ]);
  });

  it('kolejne pobranie nadpisuje, a nie dokłada', () => {
    const db = createTestDb({ seed: true });
    saveGarminRecords(db, records);
    saveGarminRecords(db, [{ ...records[0], seconds: 1290 }]);

    const stored = listGarminRecords(db, 'RUNNING');
    expect(stored).toHaveLength(2);
    expect(stored.find((record) => record.recordKey === 'DIST_5K')?.seconds).toBe(1290);
  });

  it('nie miesza dyscyplin', () => {
    const db = createTestDb({ seed: true });
    saveGarminRecords(db, records);
    expect(listGarminRecords(db, 'CYCLING')).toEqual([]);
  });
});
