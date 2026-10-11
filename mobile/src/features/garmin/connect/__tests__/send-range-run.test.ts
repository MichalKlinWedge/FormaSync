/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { ScheduledEntry } from '@/features/calendar/repository';

import { GarminAuthExpired, GarminError } from '../client';
import { sendToGarmin, type SendProgress } from '../send-range';

/**
 * Wysyłka tygodnia to kilka niezależnych rozmów z Garminem pod rząd. Sprawdzamy, co się dzieje,
 * gdy jedna z nich padnie: reszta tygodnia ma dojść, a użytkownik ma się dowiedzieć, czego
 * brakuje. Wyjątkiem jest wygasłe połączenie — po nim dalsze próby to tylko ten sam błąd razy
 * liczba treningów.
 */

type Sent = { workoutId: number; overwritten: boolean; duplicates: number[] };
const mockSendPlan = jest.fn<(db: unknown, planId: number) => Promise<Sent>>();
const mockSchedule = jest.fn<(workoutId: number, date: string) => Promise<number>>();
const mockSetGarminSchedule = jest.fn();
const mockCalendarMonth = jest.fn<() => Promise<unknown[]>>();
const mockScheduleIdIn = jest.fn<(...args: unknown[]) => number | null>();

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
  calendarMonth: () => mockCalendarMonth(),
  scheduleIdIn: (...args: unknown[]) => mockScheduleIdIn(...args),
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
  mockSendPlan.mockImplementation((_db, planId) =>
    Promise.resolve({ workoutId: planId + 1, overwritten: false, duplicates: [] }),
  );
  mockSchedule.mockImplementation(() => Promise.resolve(99));
  mockCalendarMonth.mockImplementation(() => Promise.resolve([]));
  mockScheduleIdIn.mockImplementation(() => null);
});

describe('sendToGarmin', () => {
  it('wysyła każdy trening i zapamiętuje numer wpisu', async () => {
    const result = await sendToGarmin({} as never, WEEK, undefined, '2026-10-12');

    expect(result).toMatchObject({ sent: 3, known: 0, adopted: 0, stopped: false });
    expect(result.failures).toEqual([]);
    expect(mockSchedule).toHaveBeenCalledTimes(3);
    expect(mockSetGarminSchedule).toHaveBeenCalledTimes(3);
  });

  it('pomija to, co już stoi u Garmina', async () => {
    const result = await sendToGarmin(
      {} as never,
      [WEEK[0], entry(2, '2026-10-14', { garminScheduleId: '77' })],
      undefined,
      '2026-10-12',
    );

    expect(result).toMatchObject({ sent: 1, known: 1 });
    expect(mockSendPlan).toHaveBeenCalledTimes(1);
  });

  it('błąd na jednym treningu nie zatrzymuje reszty tygodnia', async () => {
    mockSchedule.mockImplementationOnce(() => Promise.reject(new GarminError('Kalendarz odmówił.')));

    const result = await sendToGarmin({} as never, WEEK, undefined, '2026-10-12');

    expect(result.sent).toBe(2);
    expect(result.failures).toEqual([
      { date: '2026-10-12', title: 'Trening 1', reason: 'Kalendarz odmówił.' },
    ]);
  });

  it('wygasłe połączenie przerywa, zamiast powtarzać ten sam błąd', async () => {
    mockSendPlan.mockImplementationOnce(() =>
      Promise.resolve({ workoutId: 11, overwritten: false, duplicates: [] }),
    );
    mockSchedule
      .mockImplementationOnce(() => Promise.resolve(99))
      .mockImplementationOnce(() => Promise.reject(new GarminAuthExpired()));

    const result = await sendToGarmin({} as never, WEEK, undefined, '2026-10-12');

    expect(result).toMatchObject({ sent: 1, stopped: true });
    expect(result.failures).toEqual([]);
    // Trzeci trening nie został nawet spróbowany.
    expect(mockSendPlan).toHaveBeenCalledTimes(2);
  });

  it('nie wpisuje drugi raz treningu, który już stoi u Garmina tego dnia', async () => {
    // Tak bywa po wpisaniu z innego urządzenia albo po przeniesieniu terminu, przy którym numer
    // wpisu zniknął z telefonu. Zastany wpis dopinamy, zamiast zakładać drugi taki sam.
    mockScheduleIdIn.mockImplementation(() => 4321);

    const result = await sendToGarmin({} as never, WEEK, undefined, '2026-10-12');

    expect(result).toMatchObject({ sent: 0, adopted: 3 });
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockSetGarminSchedule).toHaveBeenCalledWith({}, 1, {
      workoutId: 11,
      scheduleId: 4321,
    });
  });

  it('kalendarz Garmina czyta raz na miesiąc, a nie raz na trening', async () => {
    await sendToGarmin({} as never, WEEK, undefined, '2026-10-12');
    expect(mockCalendarMonth).toHaveBeenCalledTimes(1);
  });

  it('mówi o kopiach treningu leżących w bibliotece Garmina', async () => {
    mockSendPlan.mockImplementationOnce((_db, planId) =>
      Promise.resolve({ workoutId: planId + 1, overwritten: true, duplicates: [777] }),
    );

    const result = await sendToGarmin({} as never, WEEK, undefined, '2026-10-12');

    expect(result.copies).toBe(1);
  });

  it('nazwa treningu też chroni przed dublem, nie tylko numer', async () => {
    // Dwie kopie w bibliotece pod jedną nazwą: wpis w kalendarzu wskazuje na tę, której
    // akurat nie nadpisaliśmy, więc po samym numerze wyglądałby na nieistniejący.
    mockScheduleIdIn.mockImplementation((_items, _workoutId, _date, title) =>
      title === 'Trening 1' ? 555 : null,
    );

    const result = await sendToGarmin({} as never, WEEK, undefined, '2026-10-12');

    expect(result).toMatchObject({ sent: 2, adopted: 1 });
  });

  it('melduje postęp po każdym treningu', async () => {
    const seen: string[] = [];
    await sendToGarmin(
      {} as never,
      WEEK,
      (progress: SendProgress) => seen.push(`${progress.done}/${progress.total}`),
      '2026-10-12',
    );
    expect(seen).toEqual(['0/3', '1/3', '2/3', '3/3']);
  });
});
