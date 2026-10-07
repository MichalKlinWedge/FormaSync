/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { restCue, restNotificationPlan } from '../rest-cues';

describe('sygnały odliczania przerwy', () => {
  it('dziesiąta sekunda to dzwonek, a nie piknięcie', () => {
    expect(restCue(10)).toBe('warning');
  });

  it('ostatnie pięć sekund pika', () => {
    expect([5, 4, 3, 2, 1].map(restCue)).toEqual(Array(5).fill('tick'));
  });

  it('między dzwonkiem a odliczaniem jest cisza', () => {
    // Pikanie przez całe dziesięć sekund byłoby już nie sygnałem, tylko hałasem.
    expect([9, 8, 7, 6].map(restCue)).toEqual([null, null, null, null]);
  });

  it('dalekie i zerowe sekundy milczą', () => {
    expect(restCue(60)).toBeNull();
    expect(restCue(11)).toBeNull();
    expect(restCue(0)).toBeNull();
  });
});

describe('plan powiadomień przerwy', () => {
  it('długa przerwa dostaje ostrzeżenie i koniec', () => {
    expect(restNotificationPlan(90)).toEqual([
      { kind: 'warning', afterSeconds: 80 },
      { kind: 'end', afterSeconds: 90 },
    ]);
  });

  it('przerwa krótsza niż wyprzedzenie dostaje tylko koniec', () => {
    // Ostrzeżenie o czymś, co już się stało, tylko zaśmieca pasek powiadomień.
    expect(restNotificationPlan(10)).toEqual([{ kind: 'end', afterSeconds: 10 }]);
    expect(restNotificationPlan(7)).toEqual([{ kind: 'end', afterSeconds: 7 }]);
  });

  it('przerwa, która już minęła, nie planuje niczego', () => {
    expect(restNotificationPlan(0)).toEqual([]);
    expect(restNotificationPlan(-3)).toEqual([]);
  });

  it('sekundy ułamkowe zaokrągla w górę', () => {
    // Zaokrąglenie w dół odezwałoby się przed czasem, a licznik na ekranie pokazywałby jeszcze 1.
    expect(restNotificationPlan(60.4)).toEqual([
      { kind: 'warning', afterSeconds: 51 },
      { kind: 'end', afterSeconds: 61 },
    ]);
  });

  it('ostrzeżenie wyprzedza koniec dokładnie o dziesięć sekund', () => {
    for (const seconds of [11, 45, 120, 300]) {
      const [warning, end] = restNotificationPlan(seconds);
      expect(end.afterSeconds - warning.afterSeconds).toBe(10);
    }
  });
});
