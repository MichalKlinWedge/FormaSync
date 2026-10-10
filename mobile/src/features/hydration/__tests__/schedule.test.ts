/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import type { DayWindow } from '../day';
import { reminderSlots, slotsToRemind } from '../schedule';

const WINDOW: DayWindow = { from: '08:00', to: '21:00' };
const DAY = new Date(2026, 9, 10, 12, 0);

const clock = (slots: Date[]) =>
  slots.map((slot) => `${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}`);

describe('reminderSlots', () => {
  it('rozstawia godziny od pierwszego kroku po otwarciu okna', () => {
    expect(clock(reminderSlots(WINDOW, 180, DAY))).toEqual(['11:00', '14:00', '17:00', '20:00']);
  });

  it('nie wychodzi poza zamknięcie okna', () => {
    const slots = reminderSlots({ from: '08:00', to: '12:00' }, 90, DAY);
    expect(clock(slots)).toEqual(['09:30', '11:00']);
  });

  it('odrzuca krok poza rozsądnym zakresem', () => {
    expect(reminderSlots(WINDOW, 5, DAY)).toEqual([]);
    expect(reminderSlots(WINDOW, 600, DAY)).toEqual([]);
  });

  it('z zepsutego okna nie robi żadnych godzin', () => {
    expect(reminderSlots({ from: '21:00', to: '08:00' }, 90, DAY)).toEqual([]);
  });
});

describe('slotsToRemind', () => {
  const slots = reminderSlots(WINDOW, 180, DAY);

  it('pomija godziny, które już minęły', () => {
    // Południe: 11:00 jest za nami, choćby zaległość była ogromna.
    expect(clock(slotsToRemind(slots, 0, 2600, WINDOW, DAY))).toEqual(['14:00', '17:00', '20:00']);
  });

  it('milczy, gdy wypite wyprzedza kreskę', () => {
    // Kreska o 20:00 to 2400 ml, więc wypite 2600 zdejmuje wszystkie przypomnienia.
    expect(slotsToRemind(slots, 2600, 2600, WINDOW, DAY)).toEqual([]);
  });

  it('zostawia tylko te godziny, na których będzie poniżej kreski', () => {
    // Litr wypity do południa: kreska o 14:00 to 1200 ml, o 17:00 już 1800.
    expect(clock(slotsToRemind(slots, 1000, 2600, WINDOW, DAY))).toEqual(['14:00', '17:00', '20:00']);
    // Półtora litra wystarcza na 14:00, ale na 17:00 już nie.
    expect(clock(slotsToRemind(slots, 1500, 2600, WINDOW, DAY))).toEqual(['17:00', '20:00']);
  });
});
