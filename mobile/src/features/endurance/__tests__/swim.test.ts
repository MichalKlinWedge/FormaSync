/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { buildWorkoutPayload } from '@/features/garmin/connect/payload';

import {
  describeSwimDistance,
  DRILL_LABELS,
  EQUIPMENT_LABELS,
  GARMIN_DRILLS,
  GARMIN_EQUIPMENT,
  GARMIN_STROKES,
  lengths,
  STROKE_LABELS,
} from '../swim';

describe('lengths', () => {
  it('przelicza dystans na długości basenu', () => {
    expect(lengths(400, 25)).toBe(16);
    expect(lengths(400, 50)).toBe(8);
  });

  it('dystans niepodzielny przez basen nie daje połówek długości', () => {
    // 410 m na dwudziestce piątce to 16,4 długości — liczba, której nikt nie przepłynie.
    expect(lengths(410, 25)).toBeNull();
  });

  it('brak dystansu albo bezsensowny basen to null', () => {
    expect(lengths(null, 25)).toBeNull();
    expect(lengths(400, 0)).toBeNull();
    expect(lengths(0, 25)).toBeNull();
  });
});

describe('describeSwimDistance', () => {
  const format = (meters: number) => `${meters} m`;

  it('dopisuje liczbę długości, gdy dystans dzieli się równo', () => {
    expect(describeSwimDistance(400, 25, format)).toBe('400 m · 16×');
  });

  it('przy niepodzielnym dystansie zostaje sam dystans', () => {
    expect(describeSwimDistance(410, 25, format)).toBe('410 m');
  });
});

describe('styl w treści dla Garmina', () => {
  const build = (
    stroke: keyof typeof GARMIN_STROKES | null,
    poolLength: number | null = 25,
    extra: {
      equipment?: keyof typeof GARMIN_EQUIPMENT | null;
      drill?: keyof typeof GARMIN_DRILLS | null;
    } = {},
  ) =>
    buildWorkoutPayload({
      title: 'Basen',
      sport: 'SWIMMING',
      exercises: [],
      poolLength,
      segments: [
        {
          kind: 'WORK',
          durationType: 'DISTANCE',
          distanceMeters: 100,
          durationSeconds: null,
          targetType: 'NONE',
          targetLow: null,
          targetHigh: null,
          stroke,
          equipment: extra.equipment ?? null,
          drill: extra.drill ?? null,
          repeatCount: null,
          children: [],
        },
      ],
    }) as {
      poolLength?: number;
      poolLengthUnit?: { unitKey: string };
      workoutSegments: { workoutSteps: Record<string, unknown>[] }[];
    };

  it('kraul jedzie jako free, z identyfikatorem odczytanym z konta Garmina', () => {
    const step = build('FREE').workoutSegments[0].workoutSteps[0];
    expect(step.strokeType).toEqual({ strokeTypeId: 6, strokeTypeKey: 'free' });
  });

  it('zmienny to individual_medley, a nie mixed', () => {
    const step = build('MEDLEY').workoutSegments[0].workoutSteps[0];
    expect(step.strokeType).toMatchObject({ strokeTypeKey: 'individual_medley' });
  });

  it('bez stylu nie wysyłamy pola — nie zgadujemy za użytkownika', () => {
    const step = build(null).workoutSegments[0].workoutSteps[0];
    expect(step.strokeType).toBeUndefined();
  });

  it('długość basenu jedzie w metrach', () => {
    const payload = build('FREE', 25);
    expect(payload.poolLength).toBe(25);
    expect(payload.poolLengthUnit).toMatchObject({ unitKey: 'meter' });
  });

  it('bez ustawionego basenu pole nie leci — zegarek użyje własnego ustawienia', () => {
    expect(build('FREE', null).poolLength).toBeUndefined();
  });

  it('sprzęt jedzie osobnym polem, z identyfikatorem ze słownika konta', () => {
    const step = build('FREE', 25, { equipment: 'PADDLES' }).workoutSegments[0].workoutSteps[0];
    expect(step.equipmentType).toEqual({ equipmentTypeId: 3, equipmentTypeKey: 'paddles' });
  });

  it('technika jedzie osobnym polem', () => {
    const step = build('FREE', 25, { drill: 'KICK' }).workoutSegments[0].workoutSteps[0];
    expect(step.drillType).toEqual({ drillTypeId: 1, drillTypeKey: 'kick' });
  });

  it('sprzęt i technika da się złożyć na jednym odcinku', () => {
    const step = build('FREE', 25, { equipment: 'KICKBOARD', drill: 'KICK' }).workoutSegments[0]
      .workoutSteps[0];
    expect(step).toMatchObject({
      equipmentType: { equipmentTypeKey: 'kickboard' },
      drillType: { drillTypeKey: 'kick' },
    });
  });

  it('bez sprzętu i techniki pól nie wysyłamy', () => {
    const step = build('FREE').workoutSegments[0].workoutSteps[0];
    expect(step.equipmentType).toBeUndefined();
    expect(step.drillType).toBeUndefined();
  });

  it('każdy sprzęt i każda technika mają etykietę po polsku', () => {
    for (const item of Object.keys(GARMIN_EQUIPMENT) as (keyof typeof GARMIN_EQUIPMENT)[]) {
      expect(EQUIPMENT_LABELS[item]).toBeTruthy();
    }
    for (const item of Object.keys(GARMIN_DRILLS) as (keyof typeof GARMIN_DRILLS)[]) {
      expect(DRILL_LABELS[item]).toBeTruthy();
    }
  });

  it('każdy styl ma etykietę po polsku', () => {
    for (const stroke of Object.keys(GARMIN_STROKES) as (keyof typeof GARMIN_STROKES)[]) {
      expect(STROKE_LABELS[stroke]).toBeTruthy();
    }
  });
});

describe('wbudowany szablon pływacki', () => {
  it('ma style na odcinkach, mimo że powstał przed ich wprowadzeniem', () => {
    const db = createTestDb({ seed: true });
    const plan = db
      .select()
      .from(schema.workoutPlans)
      .where(eq(schema.workoutPlans.sport, 'SWIMMING'))
      .get()!;
    const segments = db
      .select()
      .from(schema.planSegments)
      .where(eq(schema.planSegments.planId, plan.id))
      .all();

    const strokeOf = (kind: string) => segments.find((s) => s.kind === kind)?.stroke;
    expect(strokeOf('WARMUP')).toBe('ANY');
    expect(strokeOf('WORK')).toBe('FREE');
    expect(strokeOf('COOLDOWN')).toBe('BACKSTROKE');
  });
});
