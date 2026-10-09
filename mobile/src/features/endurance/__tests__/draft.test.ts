import { describe, expect, it } from '@jest/globals';

import {
  createRepeatBlock,
  createSegment,
  draftTotals,
  EnduranceDraftError,
  emptyEnduranceDraft,
  removeSegment,
  updateSegment,
  validateEnduranceDraft,
} from '../draft';
import { describeDuration, describeTarget, formatDistance, formatPace, formatSeconds, paceFrom } from '../format';

const planWith = (segments: ReturnType<typeof createSegment>[]) => ({
  ...emptyEnduranceDraft('RUNNING'),
  title: 'Interwały',
  segments,
});

describe('emptyEnduranceDraft', () => {
  it('„Różne” zaczyna od gotowego odcinka na czas — zostaje wpisać nazwę', () => {
    const [segment, ...rest] = emptyEnduranceDraft('OTHER').segments;
    expect(rest).toEqual([]);
    expect(segment.kind).toBe('WORK');
    expect(segment.durationType).toBe('TIME');
    expect(segment.durationSeconds).toBeGreaterThan(0);
    expect(segment.distanceMeters).toBeNull();
  });

  it('pozostałe dyscypliny zaczynają od pustej listy odcinków', () => {
    expect(emptyEnduranceDraft('RUNNING').segments).toEqual([]);
    expect(emptyEnduranceDraft('SWIMMING').segments).toEqual([]);
  });
});

describe('createRepeatBlock', () => {
  it('tworzy grupę z pracą i przerwą w środku', () => {
    const [group, work, recovery] = createRepeatBlock();
    expect(group.kind).toBe('REPEAT');
    expect(group.repeatCount).toBeGreaterThan(0);
    expect(work.parentKey).toBe(group.key);
    expect(recovery.parentKey).toBe(group.key);
  });
});

describe('removeSegment', () => {
  it('usuwa grupę razem z jej wnętrzem, żeby nie zostały sieroty', () => {
    const block = createRepeatBlock();
    expect(removeSegment(block, block[0].key)).toEqual([]);
  });

  it('usunięcie odcinka w grupie zostawia grupę', () => {
    const [group, work, recovery] = createRepeatBlock();
    const left = removeSegment([group, work, recovery], work.key);
    expect(left.map((s) => s.key)).toEqual([group.key, recovery.key]);
  });
});

describe('validateEnduranceDraft', () => {
  it('odrzuca plan bez nazwy', () => {
    const draft = { ...planWith([createSegment('WARMUP')]), title: '  ' };
    expect(() => validateEnduranceDraft(draft)).toThrow(EnduranceDraftError);
  });

  it('odrzuca plan bez odcinków', () => {
    expect(() => validateEnduranceDraft(planWith([]))).toThrow('przynajmniej jeden odcinek');
  });

  it('odrzuca pustą grupę powtórzeń', () => {
    expect(() => validateEnduranceDraft(planWith([createSegment('REPEAT')]))).toThrow('bez odcinków');
  });

  it('odrzuca odcinek na dystans bez dystansu', () => {
    const work = { ...createSegment('WORK'), distanceMeters: null };
    expect(() => validateEnduranceDraft(planWith([work]))).toThrow('podaj dystans');
  });

  it('odrzuca zakres celu odwrócony', () => {
    const work = { ...createSegment('WORK'), targetType: 'PACE' as const, targetLow: 330, targetHigh: 300 };
    expect(() => validateEnduranceDraft(planWith([work]))).toThrow('wyższa od górnej');
  });

  it('przyjmuje poprawne interwały', () => {
    expect(() => validateEnduranceDraft(planWith(createRepeatBlock()))).not.toThrow();
  });
});

describe('draftTotals', () => {
  it('mnoży zawartość grupy przez liczbę powtórzeń', () => {
    const [group, work, recovery] = createRepeatBlock();
    const segments = updateSegment([group, work, recovery], group.key, { repeatCount: 5 });
    // 5 × (400 m pracy) oraz 5 × (90 s przerwy)
    expect(draftTotals(segments)).toEqual({ meters: 2000, seconds: 450 });
  });

  it('pomija odcinki otwarte', () => {
    const open = createSegment('COOLDOWN');
    const segments = updateSegment([open], open.key, { durationType: 'OPEN', durationSeconds: null });
    expect(draftTotals(segments)).toEqual({ meters: 0, seconds: 0 });
  });
});

describe('formatowanie', () => {
  it('skraca dystans do kilometrów dopiero powyżej tysiąca metrów', () => {
    expect(formatDistance(400)).toBe('400 m');
    expect(formatDistance(5000)).toBe('5 km');
    expect(formatDistance(5500)).toBe('5,5 km');
  });

  it('czas pokazuje godziny tylko wtedy, gdy są', () => {
    expect(formatSeconds(90)).toBe('1:30');
    expect(formatSeconds(3660)).toBe('1:01:00');
  });

  it('tempo liczy się z dystansu i czasu', () => {
    expect(paceFrom(1000, 300)).toBe(300);
    expect(paceFrom(5000, 1500)).toBe(300);
    expect(formatPace(300)).toBe('5:00/km');
  });

  it('bez dystansu albo czasu nie zgaduje tempa', () => {
    expect(paceFrom(null, 300)).toBeNull();
    expect(paceFrom(1000, 0)).toBeNull();
  });

  it('opisuje zakończenie i cel odcinka', () => {
    expect(describeDuration('DISTANCE', 400, null)).toBe('400 m');
    expect(describeDuration('TIME', null, 90)).toBe('1:30');
    expect(describeDuration('OPEN', null, null)).toBe('do decyzji');
    expect(describeTarget('PACE', 300, 330)).toBe('tempo 5:00/km–5:30/km');
    expect(describeTarget('HEART_RATE', 140, 160)).toBe('tętno 140–160');
    expect(describeTarget('NONE', null, null)).toBeNull();
  });
});
