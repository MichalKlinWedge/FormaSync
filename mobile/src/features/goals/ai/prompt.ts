import { goalPhases, goalWorkoutKinds, type GoalPhase, type GoalWorkoutKind } from '@/db/schema';
import { formatDistance, formatSeconds } from '@/features/endurance/format';
import { addDays, startOfWeek, weekdayIndex, WEEKDAYS_LONG, weeksBetween } from '@/lib/date';
import { unwrapJson } from '@/lib/json';

import type { FormWorkout } from '../brief';
import { durationFrom, paceFor, racePace } from '../paces';
import { phasesFor, weeksUntil, type GoalBrief, type PlannedWeek, type PlannedWorkout } from '../planner';
import { KIND_NOTES, workoutTitle } from '../shapes';

import { EMPTY_CONTEXT, type PromptContext } from './context';

/**
 * Rozmowa z modelem: co mu wysyłamy i co z odpowiedzi przyjmujemy.
 *
 * Model decyduje o samej strukturze planu — w którym dniu co i jak długie. Nazwy, tempa, czasy
 * i odcinki liczymy po swojemu, tymi samymi funkcjami, co plan z reguł. Dzięki temu model nie ma
 * jak wpisać do kalendarza tempa z sufitu ani treningu, którego nazwa kłamie o jego zawartości,
 * a odpowiedź nie z tego świata jest odrzucana, nie zapisywana.
 */

export class PlanReplyError extends Error {}

/** Najwięcej, ile razy dystans zawodów może mieć jedna jednostka. Wyżej to już pomyłka modelu. */
const SANE_DISTANCE_FACTOR = 3;

const KIND_HINTS: Record<GoalWorkoutKind, string> = {
  EASY: 'spokojny bieg objętościowy',
  LONG: 'najdłuższa jednostka tygodnia',
  TEMPO: 'ciągły wysiłek w tempie bliskim startowemu',
  INTERVALS: 'odcinki szybciej od tempa startowego',
  RACE: 'same zawody, wyłącznie w dniu startu',
};

const PHASE_HINTS: Record<GoalPhase, string> = {
  BASE: 'budowanie bazy tlenowej',
  BUILD: 'wzrost obciążenia z jednostkami jakościowymi',
  PEAK: 'najwyższe obciążenie cyklu',
  TAPER: 'zejście z objętości przed startem',
  RACE: 'tydzień startowy',
};

/** Sekcja polecenia; pusta treść znaczy, że nie ma czego wysyłać i nagłówek też odpada. */
function section(title: string, body: string[]): string[] {
  return body.length === 0 ? [] : ['', title, ...body];
}

/** Polecenie dla modelu. Po polsku, bo plan ma wyjść w tym samym języku, co cała aplikacja. */
export function buildPrompt(
  brief: GoalBrief,
  history: FormWorkout[],
  from: string,
  context: PromptContext = EMPTY_CONTEXT,
): string {
  const weeks = weeksUntil(from, brief.eventDate);
  const days = brief.weekDays.map((day) => `${day} (${WEEKDAYS_LONG[day]})`).join(', ');
  const target =
    brief.targetSeconds === null ? 'bez czasu docelowego' : formatSeconds(brief.targetSeconds);

  const past =
    history.length === 0
      ? 'Brak treningów w historii.'
      : history
          .map(
            (workout) =>
              `${workout.date}: ${formatDistance(workout.meters)} w ${formatSeconds(workout.seconds)}${
                workout.paceSeconds === null ? '' : ` (${formatSeconds(workout.paceSeconds)}/km)`
              }`,
          )
          .join('\n');

  const records = context.records.map(
    (record) => `${formatDistance(record.meters)}: ${formatSeconds(record.seconds)}`,
  );

  const garmin = context.garmin.map((record) => {
    const value =
      record.seconds === null
        ? formatDistance(record.meters ?? 0)
        : formatSeconds(record.seconds);
    return `${record.label}: ${value}${record.achievedOn === null ? '' : ` (${record.achievedOn})`}`;
  });

  // Miesiące bez ani jednego treningu zostawiamy w zestawieniu: przerwa jest informacją,
  // a wycięta wyglądałaby jak ciągłość, której nie było.
  const monthly = context.monthly.map(
    (month) => `${month.month}: ${Math.round(month.meters / 1000)} km`,
  );

  // Zaplanowane kontra wykonane. Jednostka bez wykonania jest tu równie ważna jak ta zrobiona:
  // to po niej widać, że tydzień był za ciężki albo że zabrakło na niego miejsca.
  const results = context.results.map((result) => {
    const planned = `plan ${formatDistance(result.plannedMeters)}`;
    if (result.doneMeters === null) return `${result.date} ${result.kind}: ${planned} → nie wykonane`;
    const pace = result.pace === null ? '' : ` (${formatSeconds(result.pace)}/km)`;
    return `${result.date} ${result.kind}: ${planned} → ${formatDistance(result.doneMeters)}`
      + ` w ${formatSeconds(result.doneSeconds ?? 0)}${pace}`;
  });

  const own = context.guidance.trim();

  return [
    'Jesteś trenerem wytrzymałościowym. Ułóż plan treningowy pod zawody.',
    '',
    'CEL',
    `Dyscyplina: ${brief.sport}`,
    `Zawody: ${brief.title}, ${brief.eventDate}, dystans ${Math.round(brief.distanceMeters)} m`,
    `Czas docelowy: ${target}`,
    `Wiek: ${brief.age === null ? 'nieznany' : `${brief.age} lat`}`,
    `Tygodni do startu (razem z tygodniem zawodów): ${weeks}`,
    `Dni tygodnia, w które można trenować (0 = poniedziałek): ${days}`,
    `Obecna objętość tygodniowa: ${Math.round(brief.weeklyMeters)} m`,
    `Najlepsze tempo z historii: ${brief.bestPaceSeconds === null ? 'nieznane' : `${brief.bestPaceSeconds} s/km`}`,
    '',
    'HISTORIA OSTATNICH TYGODNI',
    past,
    ...section('REKORDY POLICZONE Z HISTORII', records),
    ...section('REKORDY ŻYCIOWE Z GARMINA (z całego konta, nie tylko z wczytanej historii)', garmin),
    ...section(`OBJĘTOŚĆ MIESIĄC PO MIESIĄCU (ostatnie ${context.monthly.length} miesięcy)`, monthly),
    ...section(
      'REALIZACJA DOTYCHCZASOWEGO PLANU (zaplanowane → wykonane; to jest korekta, nie pierwszy plan)',
      results,
    ),
    '',
    'ZASADY',
    `- Plan zaczyna się ${from} i kończy w dniu zawodów ${brief.eventDate}. Nie planuj niczego`
      + ' przed tą datą: przeszłość została wytrenowana albo opuszczona i tak zostaje.',
    '- Treningi wyłącznie w podanych dniach tygodnia; wyjątkiem jest dzień zawodów.',
    '- W dniu zawodów dokładnie jedna jednostka rodzaju RACE o dystansie zawodów.',
    '- Najwyżej jedna jednostka na dzień.',
    '- Pierwszy tydzień planu ma objętość zbliżoną do obecnej tygodniowej, najwyżej o dziesiątą'
      + ' część większą. Plan zaczyna się od tego, co zawodnik robi dziś, a nie od tego, do czego'
      + ' ma dojść — nawet gdy do startu zostało pół roku.',
    '- Objętość tygodniowa rośnie najwyżej o 10% na tydzień, co czwarty tydzień jest lżejszy.',
    '- Najdłuższa jednostka też rośnie stopniowo: w pierwszym tygodniu nie przekracza najdłuższego'
      + ' biegu z historii ostatnich tygodni.',
    '- Gdy historia jest uboga albo poprzerywana, pierwsze tygodnie przeznacz na odbudowę'
      + ' regularności, a nie na obciążenie.',
    '- Przed startem dwa tygodnie zejścia z objętości.',
    ...(context.results.length === 0
      ? []
      : [
          '- To jest korekta planu w trakcie cyklu. Wyjdź od realizacji powyżej: jednostki'
            + ' opuszczone albo skrócone znaczą, że obciążenie było za duże lub zabrakło na nie'
            + ' miejsca — nie powtarzaj tego samego tygodnia w nadziei, że tym razem wyjdzie.',
          '- Wykonane szybciej i lżej, niż zakładał plan, jest powodem do podniesienia poprzeczki,'
            + ' a nie do zostawienia jej tam, gdzie była.',
        ]),
    `- Rodzaje jednostek: ${goalWorkoutKinds.map((kind) => `${kind} (${KIND_HINTS[kind]})`).join(', ')}.`,
    `- Fazy tygodni: ${goalPhases.map((phase) => `${phase} (${PHASE_HINTS[phase]})`).join(', ')}.`,
    ...section(
      'WYTYCZNE OD ZAWODNIKA (ważniejsze od zasad powyżej, poza formatem odpowiedzi)',
      own === '' ? [] : [own],
    ),
    '',
    'ODPOWIEDŹ',
    'Zwróć wyłącznie JSON, bez komentarzy i bez tekstu wokół, w postaci:',
    '{"weeks":[{"phase":"BASE","workouts":[{"date":"2026-10-13","kind":"EASY","distanceMeters":8000}]}]}',
    'Dystanse w metrach, jako liczby. Nie dodawaj innych pól.',
  ].join('\n');
}

type RawWorkout = { date?: unknown; kind?: unknown; distanceMeters?: unknown };
type RawWeek = { phase?: unknown; workouts?: unknown };

/** Model lubi owinąć JSON w blok kodu — zdejmujemy go, zamiast odrzucać całą odpowiedź. */
function unwrap(text: string): string {
  const body = unwrapJson(text);
  if (body === null) throw new PlanReplyError('Model nie zwrócił JSON-a.');
  return body;
}

const isKind = (value: unknown): value is GoalWorkoutKind =>
  typeof value === 'string' && (goalWorkoutKinds as readonly string[]).includes(value);

const isPhase = (value: unknown): value is GoalPhase =>
  typeof value === 'string' && (goalPhases as readonly string[]).includes(value);

/**
 * Plan z odpowiedzi modelu. Bierzemy z niej datę, rodzaj i dystans; wszystko pozostałe liczymy
 * sami. Jednostki niemożliwe — poza zakresem dat, w dniu nietreningowym, o absurdalnym dystansie —
 * wypadają po cichu, bo lepszy plan z dziurą niż plan, który wpisze bzdurę do kalendarza.
 */
export function parsePlanReply(text: string, brief: GoalBrief, from: string): PlannedWeek[] {
  let parsed: { weeks?: unknown };
  try {
    parsed = JSON.parse(unwrap(text)) as { weeks?: unknown };
  } catch (error) {
    throw error instanceof PlanReplyError
      ? error
      : new PlanReplyError('Odpowiedzi modelu nie da się odczytać jako JSON.');
  }

  const span = weeksUntil(from, brief.eventDate);
  if (span === 0) throw new PlanReplyError('Termin zawodów już minął.');

  const firstMonday = startOfWeek(from);
  const lastDate = brief.eventDate;
  const phases = phasesFor(span);
  const allowed = new Set(brief.weekDays);
  const pace = racePace(brief.distanceMeters, brief.targetSeconds, brief.bestPaceSeconds);
  const limit = brief.distanceMeters * SANE_DISTANCE_FACTOR;

  const rawWeeks = Array.isArray(parsed.weeks) ? (parsed.weeks as RawWeek[]) : [];
  const byDate = new Map<string, PlannedWorkout>();

  for (const [weekPosition, week] of rawWeeks.entries()) {
    const rawWorkouts = Array.isArray(week?.workouts) ? (week.workouts as RawWorkout[]) : [];
    for (const workout of rawWorkouts) {
      const date = workout?.date;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      // Wcześniej niż dziś nie da się już nic przetrenować, a i tak nie weszłoby do planu:
      // zapis zostawia przeszłość nietkniętą.
      if (date < from || date > lastDate) continue;
      if (!isKind(workout.kind)) continue;
      // Zawody tylko w dniu startu, a w pozostałe dni tylko to, na co jest czas w tygodniu.
      if (workout.kind === 'RACE' && date !== brief.eventDate) continue;
      if (workout.kind !== 'RACE' && !allowed.has(weekdayIndex(date))) continue;

      const meters = Number(workout.distanceMeters);
      if (!Number.isFinite(meters) || meters <= 0 || meters > limit) continue;
      if (byDate.has(date)) continue;

      const weekIndex = weeksBetween(firstMonday, date);
      if (weekIndex < 0 || weekIndex >= span) continue;

      const phase = isPhase(week?.phase) ? week.phase : (phases[weekIndex] ?? phases[weekPosition] ?? 'BUILD');
      const distanceMeters = Math.round(meters);
      const paceSeconds = paceFor(workout.kind, pace);
      byDate.set(date, {
        weekIndex,
        phase,
        plannedDate: date,
        kind: workout.kind,
        title: workoutTitle(workout.kind, brief.sport, distanceMeters, brief.title),
        distanceMeters,
        durationSeconds: durationFrom(distanceMeters, paceSeconds),
        paceSeconds,
        notes: KIND_NOTES[workout.kind],
      });
    }
  }

  if (byDate.size === 0) throw new PlanReplyError('Model nie zwrócił ani jednej możliwej jednostki.');

  // Zawodów nie zostawiamy modelowi: plan bez dnia startu nie jest planem pod zawody.
  if (!byDate.has(brief.eventDate) || byDate.get(brief.eventDate)?.kind !== 'RACE') {
    const racePaceSeconds = paceFor('RACE', pace);
    const distanceMeters = Math.round(brief.distanceMeters);
    byDate.set(brief.eventDate, {
      weekIndex: span - 1,
      phase: 'RACE',
      plannedDate: brief.eventDate,
      kind: 'RACE',
      title: workoutTitle('RACE', brief.sport, distanceMeters, brief.title),
      distanceMeters,
      durationSeconds: durationFrom(distanceMeters, racePaceSeconds),
      paceSeconds: racePaceSeconds,
      notes: KIND_NOTES.RACE,
    });
  }

  const workouts = [...byDate.values()].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const indexes = [...new Set(workouts.map((workout) => workout.weekIndex))].sort((a, b) => a - b);

  return indexes.map((weekIndex) => {
    const inWeek = workouts.filter((workout) => workout.weekIndex === weekIndex);
    return {
      weekIndex,
      startDate: addDays(firstMonday, weekIndex * 7),
      phase: inWeek[0].phase,
      // Tygodnia lżejszego nie zgadujemy za model: po objętości i tak widać, który nim jest.
      recovery: false,
      targetMeters: Math.round(
        inWeek.reduce((sum, workout) => sum + (workout.distanceMeters ?? 0), 0),
      ),
      workouts: inWeek,
    };
  });
}
