import type { DurationType, SegmentKind, Sport, Stroke, TargetType } from '@/db/schema';
import { GARMIN_STROKES } from '@/features/endurance/swim';

/**
 * Trening w zapisie, jakiego oczekuje Garmin Connect. Kształt jest przepisany jeden do jednego
 * z narzędzia pythonowego (`tools/garmin`), które wysyła tę samą treść od miesięcy — Garmin nie
 * dokumentuje tego API, więc każde pole, którego tu brakuje, poznaje się dopiero po odrzuconym
 * treningu. Dlatego plik jest czysty i obłożony testami: wolno go zmieniać świadomie, nie przy okazji.
 */

type Named = Record<string, unknown>;

const SPORT_TYPES: Record<Sport, Named> = {
  STRENGTH: { sportTypeId: 5, sportTypeKey: 'strength_training', displayOrder: 5 },
  RUNNING: { sportTypeId: 1, sportTypeKey: 'running', displayOrder: 1 },
  CYCLING: { sportTypeId: 2, sportTypeKey: 'cycling', displayOrder: 2 },
  SWIMMING: { sportTypeId: 4, sportTypeKey: 'swimming', displayOrder: 5 },
};

const STEP_TYPES: Record<SegmentKind | 'REST', Named> = {
  WARMUP: { stepTypeId: 1, stepTypeKey: 'warmup', displayOrder: 1 },
  COOLDOWN: { stepTypeId: 2, stepTypeKey: 'cooldown', displayOrder: 2 },
  WORK: { stepTypeId: 3, stepTypeKey: 'interval', displayOrder: 3 },
  RECOVERY: { stepTypeId: 4, stepTypeKey: 'recovery', displayOrder: 4 },
  REST: { stepTypeId: 5, stepTypeKey: 'rest', displayOrder: 5 },
  REPEAT: { stepTypeId: 6, stepTypeKey: 'repeat', displayOrder: 6 },
};

const END_DISTANCE = { conditionTypeId: 3, conditionTypeKey: 'distance', displayOrder: 3, displayable: true };
const END_TIME = { conditionTypeId: 2, conditionTypeKey: 'time', displayOrder: 2, displayable: true };
const END_OPEN = { conditionTypeId: 1, conditionTypeKey: 'lap.button', displayOrder: 1, displayable: true };
const END_REPS = { conditionTypeId: 10, conditionTypeKey: 'reps', displayOrder: 10, displayable: true };
const END_ITERATIONS = {
  conditionTypeId: 7,
  conditionTypeKey: 'iterations',
  displayOrder: 7,
  displayable: false,
};

const NO_TARGET = { workoutTargetTypeId: 1, workoutTargetTypeKey: 'no.target', displayOrder: 1 };
const PACE_TARGET = { workoutTargetTypeId: 6, workoutTargetTypeKey: 'pace.zone', displayOrder: 6 };
const HR_TARGET = { workoutTargetTypeId: 4, workoutTargetTypeKey: 'heart.rate.zone', displayOrder: 4 };

const KILOGRAM = { unitId: 8, unitKey: 'kilogram', factor: 1000.0 };
const METER = { unitId: 1, unitKey: 'meter', factor: 100.0 };

/** Garmin ucina dłuższe nazwy po swojej stronie; robimy to u siebie, żeby wiedzieć, co wysyłamy. */
const MAX_TITLE = 80;

export type GarminSegment = {
  kind: SegmentKind;
  durationType: DurationType;
  distanceMeters: number | null;
  durationSeconds: number | null;
  targetType: TargetType;
  targetLow: number | null;
  targetHigh: number | null;
  stroke: Stroke | null;
  repeatCount: number | null;
  children: GarminSegment[];
};

export type GarminExercise = {
  name: string;
  garminCategory: string | null;
  trackingType: string;
  targetSets: number;
  targetReps: number | null;
  targetWeight: number | null;
  targetDurationSeconds: number | null;
  restDurationSeconds: number;
};

export type GarminPlan = {
  title: string;
  sport: Sport;
  exercises: GarminExercise[];
  segments: GarminSegment[];
  /** Długość basenu w metrach — tylko pływanie. */
  poolLength?: number | null;
};

export class EmptyPlanError extends Error {
  constructor() {
    super('Plan jest pusty — nie ma czego wysłać.');
  }
}

/**
 * Cel odcinka. Tempo Garmin przyjmuje jako **prędkość w metrach na sekundę**, nie jako sekundy
 * na kilometr. Pomylenie tych dwóch daje zakres setki razy za szeroki i trening bez sensu.
 */
function targetFields(segment: GarminSegment): Named {
  const { targetLow: low, targetHigh: high } = segment;
  if (segment.targetType === 'PACE' && low && high) {
    return {
      targetType: { ...PACE_TARGET },
      // Więcej sekund na kilometr to wolniejszy bieg, więc dolna prędkość bierze się z górnego tempa.
      targetValueOne: round(1000 / high),
      targetValueTwo: round(1000 / low),
    };
  }
  if (segment.targetType === 'HEART_RATE' && low && high) {
    return { targetType: { ...HR_TARGET }, targetValueOne: low, targetValueTwo: high };
  }
  return { targetType: { ...NO_TARGET } };
}

const round = (value: number) => Math.round(value * 10000) / 10000;

/** Pojedynczy odcinek. Odcinek otwarty kończy przycisk okrążenia na zegarku. */
function enduranceStep(segment: GarminSegment, stepOrder: number): Named {
  const [endCondition, value] =
    segment.durationType === 'DISTANCE' && segment.distanceMeters
      ? [END_DISTANCE, segment.distanceMeters]
      : segment.durationType === 'TIME' && segment.durationSeconds
        ? [END_TIME, segment.durationSeconds]
        : [END_OPEN, 0];

  return {
    type: 'ExecutableStepDTO',
    stepOrder,
    stepType: { ...(STEP_TYPES[segment.kind] ?? STEP_TYPES.WORK) },
    endCondition: { ...endCondition },
    endConditionValue: value,
    ...targetFields(segment),
    // Styl dotyczy wyłącznie pływania; w biegu i na rowerze Garmin nie wie, co z nim zrobić.
    ...(segment.stroke === null ? {} : { strokeType: { ...GARMIN_STROKES[segment.stroke] } }),
  };
}

function repeatGroup(iterations: number, steps: Named[], stepOrder: number): Named {
  return {
    type: 'RepeatGroupDTO',
    stepOrder,
    stepType: { ...STEP_TYPES.REPEAT },
    numberOfIterations: iterations,
    workoutSteps: steps,
    endCondition: { ...END_ITERATIONS },
    endConditionValue: iterations,
    smartRepeat: false,
  };
}

function enduranceSteps(segments: GarminSegment[]): Named[] {
  const steps: Named[] = [];
  let order = 1;
  for (const segment of segments) {
    if (segment.kind === 'REPEAT') {
      const groupOrder = order;
      order += 1;
      const inside = segment.children.map((child) => {
        const step = enduranceStep(child, order);
        order += 1;
        return step;
      });
      steps.push(repeatGroup(Math.max(segment.repeatCount ?? 1, 1), inside, groupOrder));
    } else {
      steps.push(enduranceStep(segment, order));
      order += 1;
    }
  }
  return steps;
}

/** Ćwiczenie siłowe: jedna seria jako krok, a liczbę serii niesie grupa powtórzeń. */
function strengthWorkStep(exercise: GarminExercise, stepOrder: number): Named {
  const timed = exercise.trackingType === 'TIME';
  const step: Named = {
    type: 'ExecutableStepDTO',
    stepOrder,
    stepType: { ...STEP_TYPES.WORK },
    endCondition: timed ? { ...END_TIME } : { ...END_REPS },
    endConditionValue: timed ? (exercise.targetDurationSeconds ?? 30) : (exercise.targetReps ?? 1),
    targetType: { ...NO_TARGET },
    category: exercise.garminCategory ?? 'UNKNOWN',
    exerciseName: '',
  };
  if (exercise.targetWeight && exercise.targetWeight > 0) {
    // Garmin liczy ciężar w gramach.
    step.weightValue = exercise.targetWeight * 1000;
    step.weightUnit = { ...KILOGRAM };
  }
  return step;
}

const strengthRestStep = (seconds: number, stepOrder: number): Named => ({
  type: 'ExecutableStepDTO',
  stepOrder,
  stepType: { ...STEP_TYPES.REST },
  endCondition: { ...END_TIME },
  endConditionValue: seconds,
  targetType: { ...NO_TARGET },
});

function strengthSteps(exercises: GarminExercise[]): Named[] {
  const steps: Named[] = [];
  let order = 1;
  for (const exercise of exercises) {
    steps.push(
      repeatGroup(
        Math.max(exercise.targetSets, 1),
        [strengthWorkStep(exercise, order + 1), strengthRestStep(exercise.restDurationSeconds, order + 2)],
        order,
      ),
    );
    // Grupa i dwa kroki w środku — następny blok zaczyna się trzy pozycje dalej.
    order += 3;
  }
  return steps;
}

/** Gotowa treść do wysłania pod `/workout-service/workout`. */
export function buildWorkoutPayload(plan: GarminPlan): Named {
  const steps =
    plan.sport === 'STRENGTH' ? strengthSteps(plan.exercises) : enduranceSteps(plan.segments);
  if (steps.length === 0) throw new EmptyPlanError();

  // Treść przyjmowana przez Garmina ma tu drobną niekonsekwencję, którą powtarzamy świadomie:
  // przy sile `displayOrder` jest tylko na górze, przy wytrzymałości w obu miejscach.
  const sportType = { ...SPORT_TYPES[plan.sport] };
  const segmentSport =
    plan.sport === 'STRENGTH' ? { sportTypeId: 5, sportTypeKey: 'strength_training' } : { ...sportType };
  return {
    workoutName: plan.title.slice(0, MAX_TITLE),
    sportType,
    estimatedDurationInSecs: 0,
    workoutSegments: [{ segmentOrder: 1, sportType: segmentSport, workoutSteps: steps }],
    author: {},
    // Zegarek liczy długości, więc musi wiedzieć, jak długi jest basen.
    ...(plan.sport === 'SWIMMING' && plan.poolLength
      ? { poolLength: plan.poolLength, poolLengthUnit: { ...METER } }
      : {}),
  };
}
