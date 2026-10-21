/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  describeShared,
  encodeShared,
  parseShared,
  type SharedPlan,
  SharedPlanError,
  SHARE_VERSION,
} from '../share';

/**
 * Format treningu do przekazania dalej. Tekst przychodzi z komunikatora, czyli z czymkolwiek
 * wokół i po dowolnym ręcznym poprawieniu — a wczytany plan ma być tym samym treningiem,
 * nie jego połową.
 */

const PLAN: SharedPlan = {
  app: 'formasync',
  version: SHARE_VERSION,
  sport: 'STRENGTH',
  title: 'Push A',
  description: 'Klata i barki',
  exercises: [
    {
      name: 'Wyciskanie leżąc',
      trackingType: 'REPS',
      sets: 4,
      reps: 8,
      weightKg: 70,
      durationSeconds: null,
      restSeconds: 120,
      notes: 'ostatnia seria do upadku',
    },
  ],
  segments: [],
};

describe('parseShared', () => {
  it('odczytuje to, co zapisał encodeShared', () => {
    expect(parseShared(encodeShared(PLAN))).toEqual(PLAN);
  });

  it('wyłuskuje trening ze znaczników kodu i zdania wokół', () => {
    const pasted = `Masz tu mój push:\n\`\`\`json\n${encodeShared(PLAN)}\n\`\`\`\nDaj znać, jak poszło.`;

    expect(parseShared(pasted).title).toBe('Push A');
  });

  it('odrzuca cudzy JSON', () => {
    expect(() => parseShared('{"title":"Push A","exercises":[]}')).toThrow(SharedPlanError);
  });

  it('odrzuca nowszą wersję formatu, zamiast wczytać połowę', () => {
    const newer = encodeShared({ ...PLAN, version: SHARE_VERSION + 1 });

    expect(() => parseShared(newer)).toThrow(/nowsza wersja/i);
  });

  it('odrzuca trening bez nazwy i trening pusty', () => {
    expect(() => parseShared(encodeShared({ ...PLAN, title: '   ' }))).toThrow(/nazwy/i);
    expect(() => parseShared(encodeShared({ ...PLAN, exercises: [] }))).toThrow(/pusty/i);
  });

  it('odrzuca tekst, który nie jest JSON-em', () => {
    expect(() => parseShared('cześć, wyślij mi ten plan')).toThrow(SharedPlanError);
    expect(() => parseShared('{"app":"formasync",')).toThrow(SharedPlanError);
  });

  it('pomija ćwiczenie bez nazwy, bo nie ma czego szukać w katalogu', () => {
    const raw = JSON.stringify({
      ...PLAN,
      exercises: [{ sets: 3, reps: 10 }, PLAN.exercises[0]],
    });

    expect(parseShared(raw).exercises.map((e) => e.name)).toEqual(['Wyciskanie leżąc']);
  });

  it('po literówce w polu słownikowym bierze wartość domyślną, a nie wywraca planu', () => {
    const raw = JSON.stringify({
      ...PLAN,
      sport: 'SIŁOWNIA',
      exercises: [{ ...PLAN.exercises[0], trackingType: 'POWTORZENIA' }],
    });
    const plan = parseShared(raw);

    expect(plan.sport).toBe('STRENGTH');
    expect(plan.exercises[0].trackingType).toBe('REPS');
  });

  it('przyjmuje liczbę w cudzysłowie i z przecinkiem — tak wygląda ręczna poprawka', () => {
    const raw = JSON.stringify({
      ...PLAN,
      exercises: [{ ...PLAN.exercises[0], weightKg: '72,5', sets: '5' }],
    });
    const exercise = parseShared(raw).exercises[0];

    expect(exercise).toMatchObject({ weightKg: 72.5, sets: 5 });
  });

  it('prostuje liczby, których nie da się wykonać', () => {
    const raw = JSON.stringify({
      ...PLAN,
      exercises: [{ ...PLAN.exercises[0], sets: 0, restSeconds: -30 }],
    });

    expect(parseShared(raw).exercises[0]).toMatchObject({ sets: 1, restSeconds: 0 });
  });
});

describe('parseShared — odcinki', () => {
  const INTERVALS: SharedPlan = {
    app: 'formasync',
    version: SHARE_VERSION,
    sport: 'RUNNING',
    title: '6 × 400 m',
    description: null,
    exercises: [],
    segments: [
      {
        kind: 'WARMUP',
        repeatCount: null,
        durationType: 'TIME',
        distanceMeters: null,
        durationSeconds: 600,
        targetType: 'NONE',
        targetLow: null,
        targetHigh: null,
        stroke: null,
        equipment: null,
        drill: null,
        notes: null,
        children: [],
      },
      {
        kind: 'REPEAT',
        repeatCount: 6,
        durationType: 'OPEN',
        distanceMeters: null,
        durationSeconds: null,
        targetType: 'NONE',
        targetLow: null,
        targetHigh: null,
        stroke: null,
        equipment: null,
        drill: null,
        notes: null,
        children: [
          {
            kind: 'WORK',
            repeatCount: null,
            durationType: 'DISTANCE',
            distanceMeters: 400,
            durationSeconds: null,
            targetType: 'PACE',
            targetLow: 230,
            targetHigh: 245,
            stroke: null,
            equipment: null,
            drill: null,
            notes: null,
            children: [],
          },
        ],
      },
    ],
  };

  it('odczytuje grupę powtórzeń razem z jej wnętrzem', () => {
    expect(parseShared(encodeShared(INTERVALS))).toEqual(INTERVALS);
  });

  it('nie wpuszcza trzeciego poziomu zagnieżdżenia, bo plan go nie zna', () => {
    const deep = JSON.parse(encodeShared(INTERVALS)) as {
      segments: { children: { children: unknown[] }[] }[];
    };
    deep.segments[1].children[0].children = [{ kind: 'WORK', durationType: 'DISTANCE', distanceMeters: 100 }];

    expect(parseShared(JSON.stringify(deep)).segments[1].children[0].children).toEqual([]);
  });
});

describe('describeShared', () => {
  it('liczy ćwiczenia treningu siłowego', () => {
    expect(describeShared(PLAN)).toMatch(/^1\sćwiczenie$/);
  });

  it('liczy odcinki razem z wnętrzem grupy powtórzeń', () => {
    // Grupa i jedna rzecz w środku to dwa odcinki — sama grupa nie mówi nic o długości treningu.
    const intervals: SharedPlan = {
      ...PLAN,
      sport: 'RUNNING',
      exercises: [],
      segments: [
        {
          kind: 'REPEAT',
          repeatCount: 6,
          durationType: 'OPEN',
          distanceMeters: null,
          durationSeconds: null,
          targetType: 'NONE',
          targetLow: null,
          targetHigh: null,
          stroke: null,
          equipment: null,
          drill: null,
          notes: null,
          children: [
            {
              kind: 'WORK',
              repeatCount: null,
              durationType: 'DISTANCE',
              distanceMeters: 400,
              durationSeconds: null,
              targetType: 'NONE',
              targetLow: null,
              targetHigh: null,
              stroke: null,
              equipment: null,
              drill: null,
              notes: null,
              children: [],
            },
          ],
        },
      ],
    };

    expect(describeShared(intervals)).toMatch(/^2\sodcinki$/);
  });
});
