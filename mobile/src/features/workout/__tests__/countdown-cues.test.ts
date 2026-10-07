/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { countdownCue, countdownNotificationPlan } from '../countdown-cues';

describe('sygnały odliczania przerwy', () => {
  it('dziesiąta sekunda to dzwonek, a nie piknięcie', () => {
    expect(countdownCue(10)).toBe('warning');
  });

  it('ostatnie pięć sekund pika', () => {
    expect([5, 4, 3, 2, 1].map(countdownCue)).toEqual(Array(5).fill('tick'));
  });

  it('między dzwonkiem a odliczaniem jest cisza', () => {
    // Pikanie przez całe dziesięć sekund byłoby już nie sygnałem, tylko hałasem.
    expect([9, 8, 7, 6].map(countdownCue)).toEqual([null, null, null, null]);
  });

  it('dalekie sekundy milczą', () => {
    expect(countdownCue(60)).toBeNull();
    expect(countdownCue(11)).toBeNull();
  });

  it('zero i to, co za nim, to sygnał końca', () => {
    // Uśpiona aplikacja przeskakuje sekundy, więc koniec musi dać się rozpoznać także z minusa.
    expect(countdownCue(0)).toBe('end');
    expect(countdownCue(-4)).toBe('end');
  });
});

describe('plan powiadomień przerwy', () => {
  it('długa przerwa dostaje ostrzeżenie i koniec', () => {
    expect(countdownNotificationPlan(90)).toEqual([
      { kind: 'warning', afterSeconds: 80 },
      { kind: 'end', afterSeconds: 90 },
    ]);
  });

  it('przerwa krótsza niż wyprzedzenie dostaje tylko koniec', () => {
    // Ostrzeżenie o czymś, co już się stało, tylko zaśmieca pasek powiadomień.
    expect(countdownNotificationPlan(10)).toEqual([{ kind: 'end', afterSeconds: 10 }]);
    expect(countdownNotificationPlan(7)).toEqual([{ kind: 'end', afterSeconds: 7 }]);
  });

  it('przerwa, która już minęła, nie planuje niczego', () => {
    expect(countdownNotificationPlan(0)).toEqual([]);
    expect(countdownNotificationPlan(-3)).toEqual([]);
  });

  it('sekundy ułamkowe zaokrągla w górę', () => {
    // Zaokrąglenie w dół odezwałoby się przed czasem, a licznik na ekranie pokazywałby jeszcze 1.
    expect(countdownNotificationPlan(60.4)).toEqual([
      { kind: 'warning', afterSeconds: 51 },
      { kind: 'end', afterSeconds: 61 },
    ]);
  });

  it('ostrzeżenie wyprzedza koniec dokładnie o dziesięć sekund', () => {
    for (const seconds of [11, 45, 120, 300]) {
      const [warning, end] = countdownNotificationPlan(seconds);
      expect(end.afterSeconds - warning.afterSeconds).toBe(10);
    }
  });
});
