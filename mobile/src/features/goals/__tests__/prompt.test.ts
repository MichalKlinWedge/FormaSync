/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { planResults, type PromptContext } from '../ai/context';
import { buildPrompt, parsePlanReply, PlanReplyError } from '../ai/prompt';
import type { GoalBrief } from '../planner';

const BRIEF: GoalBrief = {
  sport: 'RUNNING',
  title: 'Półmaraton Wrocław',
  distanceMeters: 21097,
  eventDate: '2027-02-07',
  targetSeconds: 105 * 60,
  // Wtorek, czwartek, sobota.
  weekDays: [1, 3, 5],
  weeklyMeters: 30000,
  bestPaceSeconds: 290,
  age: 41,
};

const FROM = '2026-10-12';

const HISTORY = [
  { date: '2026-10-10', meters: 12000, seconds: 3600, paceSeconds: 300 },
  { date: '2026-10-08', meters: 8000, seconds: 2560, paceSeconds: 320 },
];

const reply = (weeks: unknown) => JSON.stringify({ weeks });

describe('buildPrompt', () => {
  const prompt = buildPrompt(BRIEF, HISTORY, FROM);

  it('podaje cel, termin i dystans', () => {
    expect(prompt).toContain('2027-02-07');
    expect(prompt).toContain('21097 m');
    expect(prompt).toContain('1:45:00');
  });

  it('wylicza dni treningowe po nazwach, nie tylko numerami', () => {
    expect(prompt).toContain('1 (wtorek)');
    expect(prompt).toContain('5 (sobota)');
    expect(prompt).not.toContain('(poniedziałek)');
  });

  it('dokłada historię ostatnich tygodni', () => {
    expect(prompt).toContain('2026-10-10: 12 km');
  });

  it('bez historii mówi o tym wprost, zamiast wysyłać pustkę', () => {
    expect(buildPrompt(BRIEF, [], FROM)).toContain('Brak treningów w historii.');
  });

  it('żąda samego JSON-a', () => {
    expect(prompt).toContain('Zwróć wyłącznie JSON');
  });
});

describe('parsePlanReply', () => {
  it('czyta plan i liczy tempa po swojemu', () => {
    const weeks = parsePlanReply(
      reply([
        {
          phase: 'BASE',
          workouts: [
            { date: '2026-10-13', kind: 'EASY', distanceMeters: 8000 },
            { date: '2026-10-17', kind: 'LONG', distanceMeters: 14000 },
          ],
        },
      ]),
      BRIEF,
      FROM,
    );

    expect(weeks[0]).toMatchObject({ weekIndex: 0, startDate: '2026-10-12', phase: 'BASE', targetMeters: 22000 });
    // Tempa nie bierzemy od modelu: 1:45 na półmaratonie to 299 s/km, spokojny bieg 365.
    expect(weeks[0].workouts[0]).toMatchObject({
      kind: 'EASY',
      paceSeconds: 365,
      title: 'Spokojny 8 km',
    });
  });

  it('zdejmuje blok kodu, w który model owija odpowiedź', () => {
    const fenced = `Oto plan:\n\`\`\`json\n${reply([
      { phase: 'BASE', workouts: [{ date: '2026-10-13', kind: 'EASY', distanceMeters: 8000 }] },
    ])}\n\`\`\``;
    expect(parsePlanReply(fenced, BRIEF, FROM)[0].workouts).toHaveLength(1);
  });

  it('odrzuca jednostki w dniach, w które nie da się trenować', () => {
    // 2026-10-12 to poniedziałek, a dni treningowe to wtorek, czwartek i sobota.
    const weeks = parsePlanReply(
      reply([
        {
          phase: 'BASE',
          workouts: [
            { date: '2026-10-12', kind: 'EASY', distanceMeters: 8000 },
            { date: '2026-10-13', kind: 'EASY', distanceMeters: 8000 },
          ],
        },
      ]),
      BRIEF,
      FROM,
    );
    expect(weeks[0].workouts.map((workout) => workout.plannedDate)).toEqual(['2026-10-13']);
  });

  it('odrzuca daty poza okresem planu', () => {
    const weeks = parsePlanReply(
      reply([
        {
          phase: 'BASE',
          workouts: [
            { date: '2026-10-06', kind: 'EASY', distanceMeters: 8000 },
            { date: '2027-03-02', kind: 'EASY', distanceMeters: 8000 },
            { date: '2026-10-13', kind: 'EASY', distanceMeters: 8000 },
          ],
        },
      ]),
      BRIEF,
      FROM,
    );
    const dates = weeks.flatMap((week) => week.workouts.map((workout) => workout.plannedDate));
    expect(dates).toEqual(['2026-10-13', '2027-02-07']);
  });

  it('odrzuca nieznany rodzaj i absurdalny dystans', () => {
    const weeks = parsePlanReply(
      reply([
        {
          phase: 'BASE',
          workouts: [
            { date: '2026-10-13', kind: 'FARTLEK', distanceMeters: 8000 },
            { date: '2026-10-15', kind: 'EASY', distanceMeters: 900000 },
            { date: '2026-10-17', kind: 'LONG', distanceMeters: 14000 },
          ],
        },
      ]),
      BRIEF,
      FROM,
    );
    expect(weeks[0].workouts.map((workout) => workout.plannedDate)).toEqual(['2026-10-17']);
  });

  it('nie wpuszcza zawodów w dniu innym niż start', () => {
    const weeks = parsePlanReply(
      reply([
        {
          phase: 'BASE',
          workouts: [
            { date: '2026-10-13', kind: 'RACE', distanceMeters: 21097 },
            { date: '2026-10-15', kind: 'EASY', distanceMeters: 8000 },
          ],
        },
      ]),
      BRIEF,
      FROM,
    );
    const dates = weeks.flatMap((week) => week.workouts.map((workout) => workout.plannedDate));
    // Zawody wracają na swój dzień, a podrzucone w środku tygodnia wypadają.
    expect(dates).toEqual(['2026-10-15', '2027-02-07']);
  });

  it('dokłada dzień startu, gdy model o nim zapomniał', () => {
    const weeks = parsePlanReply(
      reply([
        { phase: 'BASE', workouts: [{ date: '2026-10-13', kind: 'EASY', distanceMeters: 8000 }] },
      ]),
      BRIEF,
      FROM,
    );
    const race = weeks.at(-1)?.workouts.at(-1);
    expect(race).toMatchObject({ kind: 'RACE', plannedDate: '2027-02-07', distanceMeters: 21097 });
  });

  it('zostawia jedną jednostkę na dzień', () => {
    const weeks = parsePlanReply(
      reply([
        {
          phase: 'BASE',
          workouts: [
            { date: '2026-10-13', kind: 'EASY', distanceMeters: 8000 },
            { date: '2026-10-13', kind: 'TEMPO', distanceMeters: 6000 },
          ],
        },
      ]),
      BRIEF,
      FROM,
    );
    expect(weeks[0].workouts).toHaveLength(1);
    expect(weeks[0].workouts[0].kind).toBe('EASY');
  });

  it('nieznaną fazę zastępuje tą, która wynika z kalendarza', () => {
    const weeks = parsePlanReply(
      reply([
        { phase: 'REGENERACJA', workouts: [{ date: '2026-10-13', kind: 'EASY', distanceMeters: 8000 }] },
      ]),
      BRIEF,
      FROM,
    );
    expect(weeks[0].phase).toBe('BASE');
  });

  it('przypisuje tygodnie po datach, a nie po kolejności w odpowiedzi', () => {
    const weeks = parsePlanReply(
      reply([
        { phase: 'BUILD', workouts: [{ date: '2026-10-27', kind: 'EASY', distanceMeters: 8000 }] },
        { phase: 'BASE', workouts: [{ date: '2026-10-13', kind: 'EASY', distanceMeters: 8000 }] },
      ]),
      BRIEF,
      FROM,
    );
    expect(weeks.map((week) => week.weekIndex)).toEqual([0, 2, 16]);
  });

  it('odmawia, gdy odpowiedź nie jest JSON-em', () => {
    expect(() => parsePlanReply('Nie umiem układać planów.', BRIEF, FROM)).toThrow(PlanReplyError);
  });

  it('odmawia, gdy nie zostaje ani jedna możliwa jednostka', () => {
    expect(() => parsePlanReply(reply([]), BRIEF, FROM)).toThrow(PlanReplyError);
    expect(() =>
      parsePlanReply(
        reply([{ phase: 'BASE', workouts: [{ date: '2020-01-01', kind: 'EASY', distanceMeters: 8000 }] }]),
        BRIEF,
        FROM,
      ),
    ).toThrow(PlanReplyError);
  });

  it('odmawia planowania po terminie zawodów', () => {
    expect(() =>
      parsePlanReply(
        reply([{ phase: 'BASE', workouts: [{ date: '2027-03-02', kind: 'EASY', distanceMeters: 8000 }] }]),
        BRIEF,
        '2027-03-01',
      ),
    ).toThrow(PlanReplyError);
  });
});

describe('kontekst w poleceniu', () => {
  const CONTEXT: PromptContext = {
    records: [
      { meters: 5000, seconds: 1267 },
      { meters: 10000, seconds: 2624 },
    ],
    garmin: [
      { label: '5 km', meters: 5000, seconds: 1253, achievedOn: '2023-09-09' },
      { label: 'Najdłuższy bieg', meters: 42620, seconds: null, achievedOn: null },
    ],
    monthly: [
      { month: '2026-08', meters: 96000 },
      { month: '2026-09', meters: 0 },
    ],
    guidance: 'Zaczynaj łagodnie, wracam po przerwie.',
    results: [],
  };

  const prompt = buildPrompt(BRIEF, [], '2026-10-12', CONTEXT);

  it('niesie rekordy policzone z historii', () => {
    expect(prompt).toContain('REKORDY POLICZONE Z HISTORII');
    expect(prompt).toContain('5 km: 21:07');
    expect(prompt).toContain('10 km: 43:44');
  });

  it('niesie rekordy życiowe z Garmina razem z datą', () => {
    expect(prompt).toContain('5 km: 20:53 (2023-09-09)');
    // W najdłuższym biegu wartością jest dystans, nie czas.
    expect(prompt).toContain('Najdłuższy bieg: 42,62 km');
  });

  it('pokazuje objętość miesiąc po miesiącu razem z miesiącami pustymi', () => {
    expect(prompt).toContain('2026-08: 96 km');
    // Przerwa jest informacją — wycięta wyglądałaby jak ciągłość, której nie było.
    expect(prompt).toContain('2026-09: 0 km');
  });

  it('niesie wytyczne zawodnika i stawia je nad regułami', () => {
    expect(prompt).toContain('WYTYCZNE OD ZAWODNIKA');
    expect(prompt).toContain('ważniejsze od zasad powyżej');
    expect(prompt).toContain('Zaczynaj łagodnie, wracam po przerwie.');
  });

  it('każe zacząć od obecnej objętości, a nie od docelowej', () => {
    expect(prompt).toContain('Pierwszy tydzień planu ma objętość zbliżoną do obecnej tygodniowej');
  });

  it('bez kontekstu nie zostawia pustych nagłówków', () => {
    const bare = buildPrompt(BRIEF, [], '2026-10-12');
    expect(bare).not.toContain('REKORDY');
    expect(bare).not.toContain('WYTYCZNE OD ZAWODNIKA');
    expect(bare).not.toContain('MIESIĄC PO MIESIĄCU');
  });

  it('puste wytyczne nie dokładają nagłówka', () => {
    const quiet = buildPrompt(BRIEF, [], '2026-10-12', { ...CONTEXT, guidance: '   ' });
    expect(quiet).not.toContain('WYTYCZNE OD ZAWODNIKA');
    expect(quiet).toContain('REKORDY POLICZONE Z HISTORII');
  });
});

describe('parsePlanReply — przeszłość', () => {
  it('nie wpuszcza jednostek z dni, które już minęły', () => {
    // 6 i 13 października to ten sam dzień tygodnia, więc o odrzuceniu decyduje wyłącznie data.
    const weeks = parsePlanReply(
      reply([
        {
          phase: 'BASE',
          workouts: [
            { date: '2026-10-06', kind: 'EASY', distanceMeters: 8000 },
            { date: '2026-10-13', kind: 'EASY', distanceMeters: 8000 },
          ],
        },
      ]),
      BRIEF,
      FROM,
    );

    const dates = weeks.flatMap((week) => week.workouts.map((workout) => workout.plannedDate));
    expect(dates).not.toContain('2026-10-06');
    expect(dates).toContain('2026-10-13');
  });
});

describe('planResults', () => {
  const PLANNED = [
    { plannedDate: '2026-10-08', kind: 'LONG' as const, distanceMeters: 16000 },
    { plannedDate: '2026-10-06', kind: 'EASY' as const, distanceMeters: 8000 },
    { plannedDate: '2026-10-15', kind: 'TEMPO' as const, distanceMeters: 10000 },
  ];
  const DONE = [
    { startTime: '2026-10-06T17:00:00.000Z', meters: 8100, seconds: 2600, pace: 321 },
    { startTime: '2026-10-08T17:00:00.000Z', meters: 12000, seconds: 3900, pace: 325 },
  ];

  it('zestawia zaplanowane z wykonanym, od najstarszego', () => {
    const results = planResults(PLANNED, DONE, '2026-10-12');

    expect(results.map((result) => result.date)).toEqual(['2026-10-06', '2026-10-08']);
    expect(results[1]).toMatchObject({ plannedMeters: 16000, doneMeters: 12000, pace: 325 });
  });

  it('jednostki bez wykonania zostają w zestawieniu', () => {
    // Opuszczony trening jest informacją: to po nim widać, że tydzień był za ciężki.
    const results = planResults(PLANNED, [], '2026-10-12');

    expect(results).toHaveLength(2);
    expect(results[0].doneMeters).toBeNull();
  });

  it('nie ocenia przyszłości', () => {
    expect(planResults(PLANNED, DONE, '2026-10-07').map((result) => result.date)).toEqual([
      '2026-10-06',
    ]);
  });
});

describe('korekta planu w poleceniu', () => {
  const WITH_RESULTS: PromptContext = {
    records: [],
    garmin: [],
    monthly: [],
    guidance: '',
    results: [
      { date: '2026-10-06', kind: 'EASY', plannedMeters: 8000, doneMeters: 8100, doneSeconds: 2600, pace: 321 },
      { date: '2026-10-08', kind: 'LONG', plannedMeters: 16000, doneMeters: null, doneSeconds: null, pace: null },
    ],
  };

  const prompt = buildPrompt(BRIEF, HISTORY, FROM, WITH_RESULTS);

  it('pokazuje, co z planu wyszło, a co nie', () => {
    expect(prompt).toContain('REALIZACJA DOTYCHCZASOWEGO PLANU');
    // Liczbę od jednostki dzieli spacja nierozdzielająca, więc porównujemy wzorcem.
    expect(prompt).toMatch(/2026-10-06 EASY: plan 8\skm → 8,1\skm w 43:20 \(5:21\/km\)/);
    expect(prompt).toMatch(/2026-10-08 LONG: plan 16\skm → nie wykonane/);
  });

  it('mówi wprost, że to korekta, a nie pierwszy plan', () => {
    expect(prompt).toContain('To jest korekta planu w trakcie cyklu');
  });

  it('bez realizacji nie dokłada zasad o korekcie', () => {
    expect(buildPrompt(BRIEF, HISTORY, FROM)).not.toContain('To jest korekta planu');
  });

  it('zabrania planowania wstecz', () => {
    expect(prompt).toContain(`Plan zaczyna się ${FROM}`);
    expect(prompt).toContain('Nie planuj niczego przed tą datą');
  });
});
