/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { ScheduledEntry } from '@/features/calendar/repository';

import { GarminAuthExpired, GarminError } from '../client';
import { sendWeekToGarmin } from '../send-week';

/**
 * Wysyłka tygodnia to kilka niezależnych rozmów z Garminem pod rząd. Sprawdzamy, co się dzieje,
 * gdy jedna z nich padnie: reszta tygodnia ma dojść, a użytkownik ma się dowiedzieć, czego
 * brakuje. Wyjątkiem jest wygasłe połączenie — po nim dalsze próby to tylko ten sam błąd razy
 * liczba treningów.
 */

const mockSendPlan = jest.fn<(db: unknown, planId: number) => Promise<{ workoutId: number }>>();
const mockSchedule = jest.fn<(workoutId: number, date: string) => Promise<number>>();
const mockSetGarminSchedule = jest.fn();

jest.mock('@/features/calendar/repository', () => ({
  setGarminSchedule: (...args: unknown[]) => mockSetGarminSchedule(...args),
}));
// Klasy błędów powstają w samej atrapie: `sendWeekToGarmin` rozpoznaje je przez instanceof,
// więc test musi rzucać dokładnie tymi, które widzi moduł.
jest.mock('../client', () => ({
  isConnected: () => Promise.resolve(true),
  GarminError: class GarminError extends Error {},
  GarminAuthExpired: class GarminAuthExpired extends Error {},
}));
jest.mock('../workouts', () => ({
  sendPlan: (db: unknown, planId: number) => mockSendPlan(db, planId),
  scheduleOnGarmin: (workoutId: number, date: string) => mockSchedule(workoutId, date),
}));

const entry = (id: number, date: string, overrides: Partial<ScheduledEntry> = {}): ScheduledEntry => ({
  id,
  planId: id * 10,
  planTitle: `Trening ${id}`,
  sport: 'RUNNING',
  scheduledDate: date,
  scheduledTime: '07:00',
  reminderOffsetMinutes: 60,
  isCompleted: false,
  status: 'PLANNED',
  garminScheduleId: null,
  sessionId: null,
  ...overrides,
});

const WEEK = [entry(1, '2026-10-12'), entry(2, '2026-10-14'), entry(3, '2026-10-17')];

beforeEach(() => {
  jest.clearAllMocks();
  mockSendPlan.mockImplementation((_db, planId) => Promise.resolve({ workoutId: planId + 1 }));
  mockSchedule.mockImplementation(() => Promise.resolve(99));
});

describe('sendWeekToGarmin', () => {
  it('wysyła każdy trening i zapamiętuje numer wpisu', async () => {
    const result = await sendWeekToGarmin({} as never, WEEK);

    expect(result).toMatchObject({ sent: 3, already: 0, stopped: false });
    expect(result.failures).toEqual([]);
    expect(mockSchedule).toHaveBeenCalledTimes(3);
    expect(mockSetGarminSchedule).toHaveBeenCalledTimes(3);
  });

  it('pomija to, co już stoi u Garmina', async () => {
    const result = await sendWeekToGarmin({} as never, [
      WEEK[0],
      entry(2, '2026-10-14', { garminScheduleId: '77' }),
    ]);

    expect(result).toMatchObject({ sent: 1, already: 1 });
    expect(mockSendPlan).toHaveBeenCalledTimes(1);
  });

  it('błąd na jednym treningu nie zatrzymuje reszty tygodnia', async () => {
    mockSchedule.mockImplementationOnce(() => Promise.reject(new GarminError('Kalendarz odmówił.')));

    const result = await sendWeekToGarmin({} as never, WEEK);

    expect(result.sent).toBe(2);
    expect(result.failures).toEqual([
      { date: '2026-10-12', title: 'Trening 1', reason: 'Kalendarz odmówił.' },
    ]);
  });

  it('wygasłe połączenie przerywa, zamiast powtarzać ten sam błąd', async () => {
    mockSendPlan.mockImplementationOnce(() => Promise.resolve({ workoutId: 11 }));
    mockSchedule
      .mockImplementationOnce(() => Promise.resolve(99))
      .mockImplementationOnce(() => Promise.reject(new GarminAuthExpired()));

    const result = await sendWeekToGarmin({} as never, WEEK);

    expect(result).toMatchObject({ sent: 1, stopped: true });
    expect(result.failures).toEqual([]);
    // Trzeci trening nie został nawet spróbowany.
    expect(mockSendPlan).toHaveBeenCalledTimes(2);
  });

  it('melduje postęp po każdym treningu', async () => {
    const seen: string[] = [];
    await sendWeekToGarmin({} as never, WEEK, (progress) =>
      seen.push(`${progress.done}/${progress.total}`),
    );
    expect(seen).toEqual(['0/3', '1/3', '2/3', '3/3']);
  });
});
