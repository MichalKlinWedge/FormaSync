/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { moveGarminSchedule } from '../move-schedule';

/**
 * Przeniesienie wpisu to u Garmina dwa osobne kroki, więc może się udać w połowie. Sprawdzamy
 * kolejność i to, co wychodzi przy każdym z niepowodzeń — bo od tego zależy, co powiemy
 * użytkownikowi o stanie jego kalendarza.
 */

const mockIsConnected = jest.fn<() => Promise<boolean>>();
const mockUnschedule = jest.fn<(scheduleId: number) => Promise<unknown>>();
const mockSendPlan = jest.fn<(db: unknown, planId: number) => Promise<{ workoutId: number }>>();
const mockSchedule = jest.fn<(workoutId: number, date: string) => Promise<number>>();
const mockSetGarminSchedule = jest.fn();
const mockOrder: string[] = [];

jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/features/calendar/repository', () => ({
  setGarminSchedule: (...args: unknown[]) => mockSetGarminSchedule(...args),
}));
jest.mock('../client', () => ({
  isConnected: () => mockIsConnected(),
  GarminError: class GarminError extends Error {},
  GarminAuthExpired: class GarminAuthExpired extends Error {},
}));
jest.mock('../workouts', () => ({
  unscheduleOnGarmin: (id: number) => {
    mockOrder.push('unschedule');
    return mockUnschedule(id);
  },
  sendPlan: (db: unknown, planId: number) => {
    mockOrder.push('send');
    return mockSendPlan(db, planId);
  },
  scheduleOnGarmin: (workoutId: number, date: string) => {
    mockOrder.push('schedule');
    return mockSchedule(workoutId, date);
  },
}));

const move = () =>
  moveGarminSchedule({
    scheduledId: 1,
    planId: 2,
    scheduleId: '42',
    fromDate: '2026-10-06',
    toDate: '2026-10-09',
  });

describe('moveGarminSchedule', () => {
  beforeEach(() => {
    mockOrder.length = 0;
    for (const mock of [mockIsConnected, mockUnschedule, mockSendPlan, mockSchedule, mockSetGarminSchedule]) {
      mock.mockReset();
    }
    mockIsConnected.mockResolvedValue(true);
    mockUnschedule.mockResolvedValue(undefined);
    mockSendPlan.mockResolvedValue({ workoutId: 7 });
    mockSchedule.mockResolvedValue(99);
  });

  it('zdejmuje stary wpis, zanim założy nowy', async () => {
    await expect(move()).resolves.toEqual({ kind: 'MOVED', date: '2026-10-09' });
    // Odwrotna kolejność zostawiłaby przy błędzie dwa te same treningi w kalendarzu.
    expect(mockOrder).toEqual(['unschedule', 'send', 'schedule']);
    expect(mockUnschedule).toHaveBeenCalledWith(42);
    expect(mockSchedule).toHaveBeenCalledWith(7, '2026-10-09');
    expect(mockSetGarminSchedule).toHaveBeenCalledWith({}, 1, { workoutId: 7, scheduleId: 99 });
  });

  it('bez połączonego konta nie rusza niczego', async () => {
    mockIsConnected.mockResolvedValue(false);
    await expect(move()).resolves.toEqual({ kind: 'NOT_CONNECTED' });
    expect(mockOrder).toEqual([]);
  });

  it('gdy nie da się zdjąć starego, nie zakładamy nowego', async () => {
    mockUnschedule.mockRejectedValue(new Error('sieć'));
    const outcome = await move();
    expect(outcome.kind).toBe('LEFT_BEHIND');
    expect(outcome).toMatchObject({ date: '2026-10-06' });
    expect(mockOrder).toEqual(['unschedule']);
  });

  it('stary zdjęty, nowego nie udało się założyć — mówimy o tym wprost', async () => {
    mockSchedule.mockRejectedValue(new Error('sieć'));
    expect((await move()).kind).toBe('REMOVED_ONLY');
    expect(mockSetGarminSchedule).not.toHaveBeenCalled();
  });
});
