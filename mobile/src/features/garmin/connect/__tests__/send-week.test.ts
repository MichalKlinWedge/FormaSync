/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import type { ScheduledEntry } from '@/features/calendar/repository';

import { describeWeekSend, pendingForGarmin, weekOf } from '../send-week';

const entry = (overrides: Partial<ScheduledEntry>): ScheduledEntry => ({
  id: 1,
  planId: 1,
  planTitle: 'Spokojny 8 km',
  sport: 'RUNNING',
  scheduledDate: '2026-10-13',
  scheduledTime: '07:00',
  reminderOffsetMinutes: 60,
  isCompleted: false,
  status: 'PLANNED',
  garminScheduleId: null,
  sessionId: null,
  ...overrides,
});

describe('weekOf', () => {
  it('bierze poniedziałek–niedzielę dnia, który wskazano', () => {
    const entries = [
      entry({ id: 1, scheduledDate: '2026-10-11' }),
      entry({ id: 2, scheduledDate: '2026-10-12' }),
      entry({ id: 3, scheduledDate: '2026-10-18' }),
      entry({ id: 4, scheduledDate: '2026-10-19' }),
    ];
    // Środa 14 października: tydzień to 12–18, więc niedziela 11 i poniedziałek 19 wypadają.
    expect(weekOf(entries, '2026-10-14').map((item) => item.id)).toEqual([2, 3]);
  });

  it('niedziela należy do tygodnia, który zaczął się w poniedziałek', () => {
    const entries = [entry({ id: 1, scheduledDate: '2026-10-12' })];
    expect(weekOf(entries, '2026-10-18')).toHaveLength(1);
  });
});

describe('pendingForGarmin', () => {
  it('pomija to, co już stoi u Garmina', () => {
    const entries = [entry({ id: 1 }), entry({ id: 2, garminScheduleId: '55' })];
    expect(pendingForGarmin(entries).map((item) => item.id)).toEqual([1]);
  });

  it('pomija trening, który się odbył', () => {
    // Kalendarz zegarka ma mówić, co przed Tobą, a nie co za Tobą.
    const entries = [entry({ id: 1, isCompleted: true }), entry({ id: 2 })];
    expect(pendingForGarmin(entries).map((item) => item.id)).toEqual([2]);
  });
});

describe('describeWeekSend', () => {
  it('mówi, ile doszło', () => {
    const text = describeWeekSend({ sent: 3, already: 0, failures: [], stopped: false });
    expect(text).toBe('Wpisane do kalendarza Garmina: 3 treningi.');
  });

  it('dolicza te, które już tam stały', () => {
    const text = describeWeekSend({ sent: 1, already: 2, failures: [], stopped: false });
    expect(text).toContain('Już tam stało: 2.');
  });

  it('wymienia z nazwy to, co nie poszło', () => {
    const text = describeWeekSend({
      sent: 2,
      already: 0,
      failures: [{ date: '2026-10-15', title: 'Interwały 5x1 km', reason: 'Plan jest pusty.' }],
      stopped: false,
    });
    expect(text).toContain('2026-10-15 — Interwały 5x1 km: Plan jest pusty.');
  });

  it('po wygaśnięciu połączenia mówi, co zrobić', () => {
    const text = describeWeekSend({ sent: 0, already: 0, failures: [], stopped: true });
    expect(text).toContain('Nic nowego nie doszło.');
    expect(text).toContain('zaloguj się ponownie');
  });
});
