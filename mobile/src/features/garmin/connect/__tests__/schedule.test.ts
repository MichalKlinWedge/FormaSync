/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Podmiana klienta jest wynoszona ponad importy, więc `workouts` dostaje już atrapę.
import { scheduleOnGarmin } from '../workouts';

const mockConnectApi = jest.fn<(path: string, init?: { method?: string; body?: unknown }) => Promise<unknown>>();

// Atrapa sięga po `mockConnectApi` dopiero przy wywołaniu: w chwili podmiany moduł testowy
// jeszcze się nie wykonał, więc sama zmienna byłaby wtedy pusta.
jest.mock('../client', () => ({
  connectApi: (...args: Parameters<typeof mockConnectApi>) => mockConnectApi(...args),
  GarminError: class GarminError extends Error {},
}));

const calendarWith = (items: unknown[]) => ({ calendarItems: items });

describe('scheduleOnGarmin', () => {
  beforeEach(() => {
    mockConnectApi.mockReset();
  });

  it('bierze numer wpisu wprost z odpowiedzi', async () => {
    mockConnectApi.mockResolvedValueOnce({ workoutScheduleId: 42 });
    await expect(scheduleOnGarmin(7, '2026-10-06')).resolves.toBe(42);
    expect(mockConnectApi).toHaveBeenCalledTimes(1);
  });

  it('gdy odpowiedź nie przyniosła numeru, odczytuje go z kalendarza', async () => {
    mockConnectApi
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(
        calendarWith([
          // Inny dzień, inny trening i inny rodzaj wpisu — żaden z nich nie jest nasz.
          { id: 1, date: '2026-10-05', itemType: 'workout', workoutId: 7 },
          { id: 2, date: '2026-10-06', itemType: 'workout', workoutId: 99 },
          { id: 3, date: '2026-10-06', itemType: 'activity', workoutId: 7 },
          { id: 4, date: '2026-10-06', itemType: 'workout', workoutId: 7 },
        ]),
      );
    await expect(scheduleOnGarmin(7, '2026-10-06')).resolves.toBe(4);
    // Miesiące w kalendarzu Garmina liczą się od zera, więc październik to dziewiątka.
    expect(mockConnectApi).toHaveBeenLastCalledWith('/calendar-service/year/2026/month/9');
  });

  it('przy kilku wpisach bierze najnowszy', async () => {
    mockConnectApi.mockResolvedValueOnce({}).mockResolvedValueOnce(
      calendarWith([
        { id: 10, date: '2026-10-06', itemType: 'workout', workoutId: 7 },
        { id: 31, date: '2026-10-06', itemType: 'workout', workoutId: 7 },
      ]),
    );
    await expect(scheduleOnGarmin(7, '2026-10-06')).resolves.toBe(31);
  });

  it('bez numeru zgłasza błąd, zamiast udawać, że się udało', async () => {
    // Milczenie kosztuje podwójnie: wpis wygląda na nieistniejący, więc kolejne kliknięcie
    // dokłada w kalendarzu Garmina drugi taki sam trening.
    mockConnectApi.mockResolvedValueOnce({}).mockResolvedValueOnce(calendarWith([]));
    await expect(scheduleOnGarmin(7, '2026-10-06')).rejects.toThrow(/numeru wpisu/);
  });
});
