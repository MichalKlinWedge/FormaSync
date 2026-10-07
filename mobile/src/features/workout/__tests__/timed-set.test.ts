/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { createTestDb } from '@/db/test-utils';
import { setSetting } from '@/db/settings';

import { clearTimedSet, loadTimedSet, startTimedSet, timedSetState } from '../timed-set';

const T0 = '2026-10-07T18:00:00.000Z';
const ms = (seconds: number) => Date.parse(T0) + seconds * 1000;

describe('zapisane odliczanie serii', () => {
  it('przeżywa zamknięcie aplikacji', () => {
    // Licznik w pamięci ginie, gdy Android uśpi aplikację; znacznik w bazie nie.
    const db = createTestDb();
    startTimedSet(db, 7, 60, T0);
    expect(loadTimedSet(db)).toEqual({ setId: 7, startedAt: T0, seconds: 60 });
  });

  it('da się odwołać', () => {
    const db = createTestDb();
    startTimedSet(db, 7, 60, T0);
    clearTimedSet(db);
    expect(loadTimedSet(db)).toBeNull();
  });

  it('uszkodzony wpis czyta się jak brak', () => {
    // Zepsuty wpis nie może wywrócić ekranu trwającego treningu.
    const db = createTestDb();
    for (const broken of ['{', '{"setId":"siedem"}', '{"setId":7,"startedAt":"...","seconds":0}']) {
      setSetting(db, 'timed_set', broken);
      expect(loadTimedSet(db)).toBeNull();
    }
  });
});

describe('stan odliczania serii', () => {
  const stored = { setId: 7, startedAt: T0, seconds: 60 };

  it('liczy czas od znacznika, a nie od liczby tyknięć', () => {
    expect(timedSetState(stored, ms(18))).toEqual({
      setId: 7,
      totalSeconds: 60,
      endsAt: ms(60),
      remainingSeconds: 42,
      elapsedSeconds: 18,
    });
  });

  it('po zerze schodzi na minus, ale czas trzymania zatrzymuje się na planie', () => {
    // Minus mówi ekranowi, że odliczanie się skończyło; wytrzymane 60 s nie rośnie dalej.
    const after = timedSetState(stored, ms(75))!;
    expect(after.remainingSeconds).toBe(-15);
    expect(after.elapsedSeconds).toBe(60);
  });

  it('przerwane w połowie zna rzeczywisty czas', () => {
    expect(timedSetState(stored, ms(48))!.elapsedSeconds).toBe(48);
  });

  it('po godzinie od końca uznaje odliczanie za porzucone', () => {
    // Inaczej powrót do aplikacji nazajutrz proponowałby zapisanie planku z wczoraj.
    expect(timedSetState(stored, ms(60 + 59 * 60))).not.toBeNull();
    expect(timedSetState(stored, ms(60 + 61 * 60))).toBeNull();
  });

  it('brak wpisu i niemożliwa data to brak stanu', () => {
    expect(timedSetState(null, ms(0))).toBeNull();
    expect(timedSetState({ ...stored, startedAt: 'kiedyś' }, ms(0))).toBeNull();
  });
});
