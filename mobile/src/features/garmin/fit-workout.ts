import {
  type Encodable,
  Encoder,
  type FileIdMesg,
  Profile,
  type WorkoutMesg,
  type WorkoutStepMesg,
} from '@garmin/fitsdk';

import type { TrackingType } from '@/db/schema';

/**
 * Eksport planu do pliku FIT, który Garmin Connect przyjmuje jako trening.
 *
 * To obejście braku dostępu do Garmin Training API: program deweloperski Garmina jest
 * wstrzymany, wymaga podmiotu prawnego i opłaty, więc planu nie da się wysłać przez API.
 * Plik FIT importuje się ręcznie w Garmin Connect, skąd trafia na zegarek.
 */

export type FitExercise = {
  name: string;
  /** Kategoria ćwiczenia w słowniku FIT, np. BENCH_PRESS. Null = krok bez kategorii. */
  garminCategory: string | null;
  trackingType: TrackingType;
  targetSets: number;
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
  restDurationSeconds: number;
};

/** Garmin Connect i zegarki mają własne limity kroków; powyżej tej liczby plik bywa odrzucany. */
export const MAX_STEPS = 200;

/** Nazwy w FIT czyta mały ekran zegarka — dłuższe i tak zostałyby ucięte. */
const MAX_NAME_LENGTH = 30;

export class FitExportError extends Error {}

const FIT_CATEGORIES: ReadonlySet<string> = new Set(
  Object.values(Profile.types.exerciseCategory as Record<string, string>),
);

/** BENCH_PRESS → benchPress. Zwraca null, gdy słownik FIT nie zna takiej kategorii. */
export function toFitCategory(category: string | null): string | null {
  if (!category) return null;
  const camel = category
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  return FIT_CATEGORIES.has(camel) ? camel : null;
}

const trim = (text: string) => text.slice(0, MAX_NAME_LENGTH);

/** Krok treningu bez numeru porządkowego — ten nadajemy przy zapisie. */
type Step = Omit<WorkoutStepMesg, 'mesgNum' | 'messageIndex'>;

/** Kroki treningu: seria robocza, po niej przerwa — poza ostatnią serią całego planu. */
export function buildWorkoutSteps(exercises: FitExercise[]): Step[] {
  const steps: Step[] = [];
  const pending: { exercise: FitExercise; setNumber: number }[] = [];
  for (const exercise of exercises) {
    for (let setNumber = 1; setNumber <= Math.max(exercise.targetSets, 1); setNumber++) {
      pending.push({ exercise, setNumber });
    }
  }

  pending.forEach(({ exercise, setNumber }, index) => {
    const timed = exercise.trackingType === 'TIME';
    const category = toFitCategory(exercise.garminCategory);

    const work: Step = {
      wktStepName: trim(exercise.name),
      durationType: timed ? 'time' : 'reps',
      // Czas trwania FIT podaje się w milisekundach, powtórzenia jako zwykłą liczbę.
      durationValue: timed ? (exercise.targetDurationSeconds ?? 30) * 1000 : (exercise.targetReps ?? 1),
      targetType: 'open',
      intensity: 'active',
    };
    if (category) work.exerciseCategory = category as WorkoutStepMesg['exerciseCategory'];
    if (exercise.targetWeight && exercise.targetWeight > 0) {
      work.exerciseWeight = exercise.targetWeight;
      work.weightDisplayUnit = 'kilogram';
    }
    steps.push(work);

    const isLast = index === pending.length - 1;
    if (!isLast && exercise.restDurationSeconds > 0) {
      steps.push({
        wktStepName: 'Przerwa',
        durationType: 'time',
        durationValue: exercise.restDurationSeconds * 1000,
        targetType: 'open',
        intensity: 'rest',
      });
    }
  });

  return steps;
}

/**
 * Składa gotowy plik FIT. Zwraca bajty do zapisania na dysku.
 *
 * Uwaga co do środowiska: koder alokuje bufor 512 kB z góry i powiększa go dopiero po
 * przekroczeniu tego rozmiaru. Hermes nie obsługuje powiększania buforów, więc limit kroków
 * trzyma plik daleko poniżej tej granicy — kilka kilobajtów na najdłuższy realny plan.
 */
export function buildWorkoutFit(title: string, exercises: FitExercise[], now: Date = new Date()): Uint8Array {
  if (exercises.length === 0) throw new FitExportError('Plan nie zawiera ćwiczeń.');

  const steps = buildWorkoutSteps(exercises);
  if (steps.length > MAX_STEPS) {
    throw new FitExportError(
      `Plan ma ${steps.length} kroków, a Garmin przyjmuje najwyżej ${MAX_STEPS}. Podziel go na krótsze treningi.`,
    );
  }

  const encoder = new Encoder();
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'workout',
    manufacturer: 'development',
    product: 0,
    serialNumber: 1,
    timeCreated: now,
  } as Encodable<FileIdMesg>);
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.WORKOUT,
    wktName: trim(title),
    sport: 'training',
    subSport: 'strengthTraining',
    numValidSteps: steps.length,
  } as Encodable<WorkoutMesg>);
  steps.forEach((step, messageIndex) => {
    encoder.writeMesg({
      mesgNum: Profile.MesgNum.WORKOUT_STEP,
      messageIndex,
      ...step,
    } as Encodable<WorkoutStepMesg>);
  });
  return encoder.close();
}

/** Nazwa pliku bez znaków, których nie lubią systemy plików. */
export function fitFileName(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/gi, 'l')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'trening'}.fit`;
}
