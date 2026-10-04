import type { DurationType, SegmentKind, Sport, TargetType } from '@/db/schema';

/**
 * Wersja robocza planu wytrzymałościowego. Odcinki trzymamy płasko, a przynależność do grupy
 * powtórzeń wyraża `parentKey` — to samo, co `parent_id` w bazie, tylko przed zapisem nie ma
 * jeszcze identyfikatorów. Dwa poziomy: grupa i jej wnętrze, bez zagnieżdżania grup w grupach.
 */
export type SegmentDraft = {
  key: string;
  parentKey: string | null;
  kind: SegmentKind;
  repeatCount: number | null;
  durationType: DurationType;
  distanceMeters: number | null;
  durationSeconds: number | null;
  targetType: TargetType;
  targetLow: number | null;
  targetHigh: number | null;
  notes: string | null;
};

export type EnduranceDraft = {
  id?: number;
  sport: Sport;
  title: string;
  description: string;
  segments: SegmentDraft[];
};

export const SEGMENT_LABELS: Record<SegmentKind, string> = {
  WARMUP: 'Rozgrzewka',
  WORK: 'Praca',
  RECOVERY: 'Przerwa',
  COOLDOWN: 'Schłodzenie',
  REPEAT: 'Powtórzenia',
};

export const DEFAULT_REPEATS = 4;
const DEFAULT_WORK_METERS = 400;
const DEFAULT_RECOVERY_SECONDS = 90;
const DEFAULT_WARMUP_SECONDS = 600;

let counter = 0;
export const newSegmentKey = (): string => `s${(counter += 1)}`;

export const emptyEnduranceDraft = (sport: Sport): EnduranceDraft => ({
  sport,
  title: '',
  description: '',
  segments: [],
});

const base = (kind: SegmentKind, parentKey: string | null = null): SegmentDraft => ({
  key: newSegmentKey(),
  parentKey,
  kind,
  repeatCount: null,
  durationType: 'OPEN',
  distanceMeters: null,
  durationSeconds: null,
  targetType: 'NONE',
  targetLow: null,
  targetHigh: null,
  notes: null,
});

export function createSegment(kind: SegmentKind, parentKey: string | null = null): SegmentDraft {
  const segment = base(kind, parentKey);
  if (kind === 'REPEAT') return { ...segment, repeatCount: DEFAULT_REPEATS };
  if (kind === 'WARMUP' || kind === 'COOLDOWN') {
    return { ...segment, durationType: 'TIME', durationSeconds: DEFAULT_WARMUP_SECONDS };
  }
  if (kind === 'RECOVERY') {
    return { ...segment, durationType: 'TIME', durationSeconds: DEFAULT_RECOVERY_SECONDS };
  }
  return { ...segment, durationType: 'DISTANCE', distanceMeters: DEFAULT_WORK_METERS };
}

/** Grupa powtórzeń z jednym odcinkiem pracy i jedną przerwą — najczęstszy kształt interwałów. */
export function createRepeatBlock(): SegmentDraft[] {
  const group = createSegment('REPEAT');
  return [group, createSegment('WORK', group.key), createSegment('RECOVERY', group.key)];
}

export const topLevel = (segments: SegmentDraft[]): SegmentDraft[] =>
  segments.filter((segment) => segment.parentKey === null);

export const childrenOf = (segments: SegmentDraft[], key: string): SegmentDraft[] =>
  segments.filter((segment) => segment.parentKey === key);

/** Usuwa odcinek, a razem z grupą jej wnętrze — osierocone odcinki nie mają sensu. */
export function removeSegment(segments: SegmentDraft[], key: string): SegmentDraft[] {
  return segments.filter((segment) => segment.key !== key && segment.parentKey !== key);
}

export function updateSegment(
  segments: SegmentDraft[],
  key: string,
  change: Partial<SegmentDraft>,
): SegmentDraft[] {
  return segments.map((segment) => (segment.key === key ? { ...segment, ...change } : segment));
}

export class EnduranceDraftError extends Error {}

export function validateEnduranceDraft(draft: EnduranceDraft): void {
  if (draft.title.trim().length === 0) throw new EnduranceDraftError('Plan musi mieć nazwę.');
  if (draft.segments.length === 0) throw new EnduranceDraftError('Dodaj przynajmniej jeden odcinek.');

  for (const segment of draft.segments) {
    const label = SEGMENT_LABELS[segment.kind];
    if (segment.kind === 'REPEAT') {
      if ((segment.repeatCount ?? 0) < 1) {
        throw new EnduranceDraftError(`${label}: liczba powtórzeń musi być większa od zera.`);
      }
      if (childrenOf(draft.segments, segment.key).length === 0) {
        throw new EnduranceDraftError(`${label}: grupa bez odcinków w środku nic nie robi.`);
      }
      continue;
    }
    if (segment.durationType === 'DISTANCE' && (segment.distanceMeters ?? 0) <= 0) {
      throw new EnduranceDraftError(`${label}: podaj dystans.`);
    }
    if (segment.durationType === 'TIME' && (segment.durationSeconds ?? 0) <= 0) {
      throw new EnduranceDraftError(`${label}: podaj czas.`);
    }
    if (segment.targetType !== 'NONE') {
      const low = segment.targetLow;
      const high = segment.targetHigh;
      if (low === null || high === null) throw new EnduranceDraftError(`${label}: uzupełnij zakres celu.`);
      if (low > high) throw new EnduranceDraftError(`${label}: dolna granica celu jest wyższa od górnej.`);
    }
  }
}

/** Łączny dystans i czas planu, z uwzględnieniem powtórzeń. Odcinki otwarte pomijamy. */
export function draftTotals(segments: SegmentDraft[]): { meters: number; seconds: number } {
  let meters = 0;
  let seconds = 0;
  for (const segment of segments) {
    if (segment.kind === 'REPEAT') continue;
    const parent = segment.parentKey
      ? segments.find((other) => other.key === segment.parentKey)
      : undefined;
    const times = parent?.repeatCount ?? 1;
    meters += (segment.distanceMeters ?? 0) * times;
    seconds += (segment.durationSeconds ?? 0) * times;
  }
  return { meters, seconds };
}
