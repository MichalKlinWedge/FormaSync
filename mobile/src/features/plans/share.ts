import {
  type Drill,
  drills,
  type DurationType,
  durationTypes,
  type SegmentKind,
  segmentKinds,
  type Sport,
  sports,
  type Stroke,
  strokes,
  type SwimEquipment,
  swimEquipment,
  type TargetType,
  targetTypes,
  type TrackingType,
  trackingTypes,
} from '@/db/schema';
import { unwrapJson } from '@/lib/json';
import { pluralWith } from '@/lib/number';

/**
 * Trening do przekazania komuś innemu — zapis i odczyt.
 *
 * Format jest tekstowy i czytelny, bo idzie przez komunikator albo e-mail: kto dostanie taki
 * plan, może go przeczytać także okiem, zanim wczyta. Identyfikatorów z bazy nie wysyłamy —
 * u odbiorcy nic by nie znaczyły. Ćwiczenia jadą nazwami i to po nazwach wracają do jego
 * katalogu; czego u siebie nie ma, dopisuje się jako własne.
 *
 * Numer wersji jest po to, żeby starsza aplikacja powiedziała wprost „to zapisała nowsza
 * wersja”, zamiast wczytać połowę planu i przemilczeć resztę.
 */

export const SHARE_VERSION = 1;

/** Znacznik, po którym poznajemy swój plik. Bez niego wczytywalibyśmy cudzy JSON na ślepo. */
const APP = 'formasync';

export class SharedPlanError extends Error {}

export type SharedExercise = {
  name: string;
  trackingType: TrackingType;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
  restSeconds: number;
  notes: string | null;
};

/** Odcinek treningu wytrzymałościowego. Grupa powtórzeń trzyma swoje wnętrze w `children`. */
export type SharedSegment = {
  kind: SegmentKind;
  repeatCount: number | null;
  durationType: DurationType;
  distanceMeters: number | null;
  durationSeconds: number | null;
  targetType: TargetType;
  targetLow: number | null;
  targetHigh: number | null;
  stroke: Stroke | null;
  equipment: SwimEquipment | null;
  drill: Drill | null;
  notes: string | null;
  children: SharedSegment[];
};

export type SharedPlan = {
  app: typeof APP;
  version: number;
  sport: Sport;
  title: string;
  description: string | null;
  /** Trening siłowy; pusty dla wytrzymałościowego. */
  exercises: SharedExercise[];
  /** Trening wytrzymałościowy; pusty dla siłowego. */
  segments: SharedSegment[];
};

/** Tekst do wysłania. Z wcięciami, bo w komunikatorze i tak widać go jako tekst. */
export const encodeShared = (plan: SharedPlan): string => JSON.stringify(plan, null, 2);

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw => (typeof value === 'object' && value !== null ? (value as Raw) : {});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Tekst albo null. Puste i same spacje traktujemy jak brak — tak samo robi reszta aplikacji. */
function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Liczba albo null. Liczba w cudzysłowie też przejdzie: ręcznie poprawiony plik tak wygląda. */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Wartość ze słownika albo wartość zastępcza. Literówka w polu nie może wywrócić całego planu. */
function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function parseExercise(raw: Raw): SharedExercise | null {
  const name = asText(raw.name);
  if (name === null) return null;
  const sets = asNumber(raw.sets);
  const rest = asNumber(raw.restSeconds);
  return {
    name,
    trackingType: asEnum(raw.trackingType, trackingTypes, 'REPS'),
    sets: sets === null ? 1 : Math.max(1, Math.round(sets)),
    reps: asNumber(raw.reps),
    weightKg: asNumber(raw.weightKg),
    durationSeconds: asNumber(raw.durationSeconds),
    restSeconds: rest === null ? 90 : Math.max(0, Math.round(rest)),
    notes: asText(raw.notes),
  };
}

function parseSegment(raw: Raw, nested: boolean): SharedSegment {
  const kind = asEnum(raw.kind, segmentKinds, 'WORK');
  const repeats = asNumber(raw.repeatCount);
  return {
    kind,
    repeatCount: repeats === null ? null : Math.max(1, Math.round(repeats)),
    durationType: asEnum(raw.durationType, durationTypes, 'OPEN'),
    distanceMeters: asNumber(raw.distanceMeters),
    durationSeconds: asNumber(raw.durationSeconds),
    targetType: asEnum(raw.targetType, targetTypes, 'NONE'),
    targetLow: asNumber(raw.targetLow),
    targetHigh: asNumber(raw.targetHigh),
    stroke: typeof raw.stroke === 'string' ? asEnum(raw.stroke, strokes, 'ANY') : null,
    equipment: typeof raw.equipment === 'string' ? asEnum(raw.equipment, swimEquipment, 'FINS') : null,
    drill: typeof raw.drill === 'string' ? asEnum(raw.drill, drills, 'DRILL') : null,
    notes: asText(raw.notes),
    // Baza zna dwa poziomy odcinków i tyle samo zna ten format: grupa w grupie nie ma
    // odpowiednika ani w planie, ani w treningu na zegarku.
    children: nested ? [] : asArray(raw.children).map((child) => parseSegment(asRecord(child), true)),
  };
}

/**
 * Odczyt wklejonego treningu.
 *
 * Tekst przychodzi z komunikatora, więc bywa w znacznikach kodu albo z dopisanym zdaniem —
 * wyłuskujemy z niego JSON zamiast odrzucać całość. Odrzucamy natomiast wszystko, czego nie da
 * się uczciwie wczytać: cudzy plik, nowszą wersję formatu i plan bez treści.
 */
export function parseShared(text: string): SharedPlan {
  const body = unwrapJson(text);
  if (body === null) throw new SharedPlanError('W tym tekście nie ma treningu — wklej całość, razem z nawiasami.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SharedPlanError('Tekst jest niepełny albo uszkodzony — wklej go jeszcze raz w całości.');
  }

  const raw = asRecord(parsed);
  if (raw.app !== APP) throw new SharedPlanError('To nie jest trening z FormaSync.');

  const version = asNumber(raw.version) ?? 0;
  if (version > SHARE_VERSION) {
    throw new SharedPlanError('Ten trening zapisała nowsza wersja aplikacji. Zaktualizuj swoją i spróbuj ponownie.');
  }

  const title = asText(raw.title);
  if (title === null) throw new SharedPlanError('Trening nie ma nazwy.');

  const exercises = asArray(raw.exercises)
    .map((item) => parseExercise(asRecord(item)))
    .filter((item): item is SharedExercise => item !== null);
  const segments = asArray(raw.segments).map((item) => parseSegment(asRecord(item), false));

  if (exercises.length === 0 && segments.length === 0) {
    throw new SharedPlanError('Trening jest pusty — nie ma w nim ani ćwiczeń, ani odcinków.');
  }

  return {
    app: APP,
    version: SHARE_VERSION,
    sport: asEnum(raw.sport, sports, 'STRENGTH'),
    title,
    description: asText(raw.description),
    exercises,
    segments,
  };
}

/**
 * Co jest w tym treningu — zdanie do podejrzenia przed wczytaniem.
 *
 * Bez dyscypliny, bo tę ekran zna z własnych nazw; tutaj liczy się to, czego w wklejonym tekście
 * nie widać na pierwszy rzut oka: ile tego jest.
 */
export function describeShared(plan: SharedPlan): string {
  const parts = [
    plan.exercises.length === 0
      ? null
      : pluralWith(plan.exercises.length, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń'),
    plan.segments.length === 0
      ? null
      : pluralWith(countSegments(plan.segments), 'odcinek', 'odcinki', 'odcinków'),
  ].filter((part) => part !== null);
  return parts.join(' · ');
}

/** Odcinki razem z wnętrzem grup — grupa bez tego, co w środku, nie mówi nic o długości treningu. */
const countSegments = (segments: SharedSegment[]): number =>
  segments.reduce((sum, segment) => sum + 1 + segment.children.length, 0);
