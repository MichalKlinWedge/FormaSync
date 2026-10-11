/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import type { ScheduledEntry } from '@/features/calendar/repository';

import {
  describeSend,
  inRange,
  nextWeek,
  pendingForGarmin,
  weekAround,
} from '../send-range';

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

describe('nextWeek', () => {
  it('to poniedziałek–niedziela tygodnia po bieżącym', () => {
    // Środa 14 października 2026 → 19–25 października.
    expect(nextWeek('2026-10-14')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });

  it('w niedzielę celuje w tydzień, który zaczyna się nazajutrz', () => {
    expect(nextWeek('2026-10-18')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });
});

describe('weekAround', () => {
  it('bierze poniedziałek i niedzielę dnia, który wskazano', () => {
    expect(weekAround('2026-10-14')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });
});

describe('inRange', () => {
  it('bierze terminy z okresu razem z jego granicami i układa po dacie', () => {
    const entries = [
      entry({ id: 1, scheduledDate: '2026-10-25' }),
      entry({ id: 2, scheduledDate: '2026-10-18' }),
      entry({ id: 3, scheduledDate: '2026-10-19' }),
      entry({ id: 4, scheduledDate: '2026-10-26' }),
    ];
    const chosen = inRange(entries, { from: '2026-10-19', to: '2026-10-25' });
    expect(chosen.map((item) => item.id)).toEqual([3, 1]);
  });
});

describe('pendingForGarmin', () => {
  // Terminy z atrapy stoją na 13 października, więc to jest „dziś” — granica włącznie.
  const today = '2026-10-13';

  it('pomija to, co już stoi u Garmina', () => {
    const entries = [entry({ id: 1 }), entry({ id: 2, garminScheduleId: '55' })];
    expect(pendingForGarmin(entries, today).map((item) => item.id)).toEqual([1]);
  });

  it('pomija trening, który się odbył', () => {
    // Kalendarz zegarka ma mówić, co przed Tobą, a nie co za Tobą.
    const entries = [entry({ id: 1, isCompleted: true }), entry({ id: 2 })];
    expect(pendingForGarmin(entries, today).map((item) => item.id)).toEqual([2]);
  });

  it('pomija przeszłość, ale dzisiejszy trening zostaje', () => {
    const entries = [
      entry({ id: 1, scheduledDate: '2026-10-12' }),
      entry({ id: 2, scheduledDate: today }),
      entry({ id: 3, scheduledDate: '2026-10-15' }),
    ];
    expect(pendingForGarmin(entries, today).map((item) => item.id)).toEqual([2, 3]);
  });
});

describe('describeSend', () => {
  const nothing = { sent: 0, known: 0, adopted: 0, copies: 0, failures: [], stopped: false };

  it('mówi, ile doszło', () => {
    expect(describeSend({ ...nothing, sent: 3 })).toBe(
      'Wpisane do kalendarza Garmina: 3 treningi.',
    );
  });

  it('osobno liczy wpisy zastane u Garmina', () => {
    const text = describeSend({ ...nothing, sent: 1, adopted: 2, known: 1 });
    expect(text).toContain('Zastane u Garmina i dopięte zamiast wpisania drugi raz: 2.');
    expect(text).toContain('Już tam stało: 1.');
  });

  it('wymienia z nazwy to, co nie poszło', () => {
    const text = describeSend({
      ...nothing,
      sent: 2,
      failures: [{ date: '2026-10-15', title: 'Interwały 5x1 km', reason: 'Plan jest pusty.' }],
    });
    expect(text).toContain('2026-10-15 — Interwały 5x1 km: Plan jest pusty.');
  });

  it('mówi o starszych kopiach w bibliotece, zamiast kasować je sama', () => {
    const text = describeSend({ ...nothing, sent: 2, copies: 2 });
    expect(text).toContain('starsze kopie 2 treningów');
  });

  it('po wygaśnięciu połączenia mówi, co zrobić', () => {
    const text = describeSend({ ...nothing, stopped: true });
    expect(text).toContain('Nic nowego nie doszło.');
    expect(text).toContain('zaloguj się ponownie');
  });
});
