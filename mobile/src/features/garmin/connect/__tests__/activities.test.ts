/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { garminSport, parseGarminTime, toActivityFromGarmin, type GarminActivityRow } from '../activities';

const row = (over: Partial<GarminActivityRow> = {}): GarminActivityRow => ({
  activityId: 123,
  activityName: 'Kardio',
  startTimeGMT: '2026-10-09 16:12:34',
  startTimeLocal: '2026-10-09 18:12:34',
  duration: 1800,
  distance: 0,
  averageHR: 128,
  maxHR: 162,
  calories: 310,
  activityType: { typeKey: 'cardio_training' },
  ...over,
});

describe('parseGarminTime', () => {
  it('czas bez strefy traktuje jako UTC, a nie jako czas lokalny', () => {
    // Bez dopisanego „Z” trening przeskoczyłby o kilka godzin i wylądował w złym dniu kalendarza.
    expect(parseGarminTime('2026-10-09 16:12:34')).toBe('2026-10-09T16:12:34.000Z');
  });

  it('nie dokleja strefy tam, gdzie już jest', () => {
    expect(parseGarminTime('2026-10-09T16:12:34Z')).toBe('2026-10-09T16:12:34.000Z');
    expect(parseGarminTime('2026-10-09T18:12:34+02:00')).toBe('2026-10-09T16:12:34.000Z');
  });

  it('pustej i niezrozumiałej daty nie zgaduje', () => {
    expect(parseGarminTime(null)).toBeNull();
    expect(parseGarminTime('')).toBeNull();
    expect(parseGarminTime('kiedyś')).toBeNull();
  });
});

describe('garminSport', () => {
  it('rozpoznaje dyscypliny po rdzeniu nazwy, nie po pełnym słowniku', () => {
    // Garmin dokłada nowe klucze, a `trail_running` to nadal bieganie.
    expect(garminSport('running')).toBe('RUNNING');
    expect(garminSport('trail_running')).toBe('RUNNING');
    expect(garminSport('treadmill_running')).toBe('RUNNING');
    expect(garminSport('road_biking')).toBe('CYCLING');
    expect(garminSport('indoor_cycling')).toBe('CYCLING');
    expect(garminSport('virtual_ride')).toBe('CYCLING');
    expect(garminSport('lap_swimming')).toBe('SWIMMING');
    expect(garminSport('strength_training')).toBe('STRENGTH');
  });

  it('marszu i wędrówki nie liczy jako biegania', () => {
    // Siedemnastogodzinna wędrówka po Tatrach zostawała najdłuższym „biegiem”, a jej odcinki
    // trafiały do rekordów biegowych i do objętości, z której plan liczy formę.
    expect(garminSport('walking')).toBe('OTHER');
    expect(garminSport('casual_walking')).toBe('OTHER');
    expect(garminSport('speed_walking')).toBe('OTHER');
    expect(garminSport('hiking')).toBe('OTHER');
    expect(garminSport('mountain_hiking')).toBe('OTHER');
  });

  it('nierozpoznaną aktywność wrzuca do „Różnych”, a nie do siły', () => {
    // Kardio, taniec czy joga zapisane jako siła psułyby tonaż i rekordy.
    expect(garminSport('cardio_training')).toBe('OTHER');
    expect(garminSport('yoga')).toBe('OTHER');
    expect(garminSport(null)).toBe('OTHER');
    expect(garminSport('coś_nowego')).toBe('OTHER');
  });
});

describe('toActivityFromGarmin', () => {
  it('składa aktywność z pomiarami i liczy koniec z czasu trwania', () => {
    expect(toActivityFromGarmin(row())).toEqual({
      recordId: 'garmin:123',
      title: 'Kardio',
      sport: 'OTHER',
      startTime: '2026-10-09T16:12:34.000Z',
      endTime: '2026-10-09T16:42:34.000Z',
      durationSeconds: 1800,
      distanceMeters: null,
      avgHeartRate: 128,
      maxHeartRate: 162,
      caloriesBurned: 310,
    });
  });

  it('dystans zerowy to brak pomiaru, a nie przebyte zero metrów', () => {
    expect(toActivityFromGarmin(row({ distance: 0 }))?.distanceMeters).toBeNull();
    expect(toActivityFromGarmin(row({ distance: 5012.4 }))?.distanceMeters).toBe(5012.4);
  });

  it('bez nazwy bierze nazwę ogólną zgodną z dyscypliną', () => {
    const activity = toActivityFromGarmin(
      row({ activityName: null, activityType: { typeKey: 'running' } }),
    );
    expect(activity?.title).toBe('Bieganie');
  });

  it('brakujące pomiary zostają puste, zamiast wywracać odczyt', () => {
    const activity = toActivityFromGarmin({
      activityId: 9,
      startTimeGMT: '2026-10-09 16:00:00',
    });
    expect(activity).toMatchObject({
      recordId: 'garmin:9',
      title: 'Trening',
      sport: 'OTHER',
      durationSeconds: 0,
      distanceMeters: null,
      avgHeartRate: null,
      maxHeartRate: null,
      caloriesBurned: null,
    });
  });

  it('bez identyfikatora albo bez czasu startu nie zwraca nic', () => {
    // Bez numeru nie odróżnilibyśmy ponownego pobrania od nowego treningu.
    expect(toActivityFromGarmin(row({ activityId: null }))).toBeNull();
    expect(toActivityFromGarmin(row({ startTimeGMT: null, startTimeLocal: null }))).toBeNull();
  });

  it('gdy brakuje czasu UTC, bierze lokalny, żeby nie zgubić treningu', () => {
    const activity = toActivityFromGarmin(row({ startTimeGMT: null }));
    expect(activity?.startTime).toBe('2026-10-09T18:12:34.000Z');
  });
});
