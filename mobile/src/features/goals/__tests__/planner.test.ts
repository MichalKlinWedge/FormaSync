/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { weekdayIndex } from '@/lib/date';

import {
  assignDays,
  longCapFor,
  phasesFor,
  planGoal,
  qualityKind,
  weeklyVolumes,
  weeksUntil,
  type GoalBrief,
} from '../planner';

const HALF: GoalBrief = {
  sport: 'RUNNING',
  title: 'Półmaraton Wrocław',
  distanceMeters: 21097,
  eventDate: '2027-02-07',
  targetSeconds: 105 * 60,
  // Wtorek, czwartek, sobota, niedziela.
  weekDays: [1, 3, 5, 6],
  weeklyMeters: 30000,
  bestPaceSeconds: 290,
};

const FROM = '2026-10-12';

describe('weeksUntil', () => {
  it('liczy tygodnie razem z tygodniem zawodów', () => {
    expect(weeksUntil('2026-10-12', '2026-10-18')).toBe(1);
    expect(weeksUntil('2026-10-12', '2026-10-19')).toBe(2);
    expect(weeksUntil(FROM, HALF.eventDate)).toBe(17);
  });

  it('data w środku tygodnia nie zmienia liczby tygodni', () => {
    // Oba dni leżą w tym samym tygodniu kalendarzowym.
    expect(weeksUntil('2026-10-14', '2026-10-18')).toBe(1);
  });

  it('zawody, które już były, nie dają planu', () => {
    expect(weeksUntil('2026-10-12', '2026-10-04')).toBe(0);
  });
});

describe('phasesFor', () => {
  it('ostatni tydzień to zawsze start', () => {
    expect(phasesFor(1)).toEqual(['RACE']);
    expect(phasesFor(17).at(-1)).toBe('RACE');
  });

  it('przed startem wstawia roztrenowanie', () => {
    expect(phasesFor(2)).toEqual(['TAPER', 'RACE']);
    expect(phasesFor(17).slice(-3)).toEqual(['TAPER', 'TAPER', 'RACE']);
  });

  it('resztę dzieli na bazę, budowanie i szczyt', () => {
    const phases = phasesFor(17);
    const count = (phase: string) => phases.filter((item) => item === phase).length;
    expect(count('BASE')).toBe(6);
    expect(count('BUILD')).toBe(5);
    expect(count('PEAK')).toBe(3);
    // Fazy nie mogą się przeplatać: najpierw cała baza, potem budowanie, potem szczyt.
    expect(phases.slice(0, 6).every((phase) => phase === 'BASE')).toBe(true);
  });

  it('w krótkim okresie nie udaje pełnego cyklu', () => {
    expect(phasesFor(3)).toEqual(['BUILD', 'TAPER', 'RACE']);
    expect(phasesFor(4)).toEqual(['BUILD', 'TAPER', 'TAPER', 'RACE']);
  });
});

describe('longCapFor', () => {
  it('biegacz nie przebiega maratonu na treningu', () => {
    expect(longCapFor('RUNNING', 42195)).toBe(32000);
  });

  it('na krótszym dystansie sufit wynika z samego dystansu', () => {
    expect(longCapFor('RUNNING', 10000)).toBe(8500);
  });

  it('pływak przepłynie więcej niż na starcie', () => {
    expect(longCapFor('SWIMMING', 1500)).toBe(1800);
  });
});

describe('weeklyVolumes', () => {
  const phases = phasesFor(17);
  const volumes = weeklyVolumes(HALF, phases);

  it('zaczyna od obecnej objętości', () => {
    expect(volumes[0]).toBe(30000);
  });

  it('nie podnosi objętości szybciej niż o dziesięć procent na tydzień', () => {
    const loadingWeeks = phases.filter(
      (phase) => phase === 'BASE' || phase === 'BUILD' || phase === 'PEAK',
    ).length;
    // Reguła dotyczy linii progresji, a nie powrotu po tygodniu lżejszym — ten wraca do
    // obciążenia, z którego zszedł, i wzrost względem niego nie jest nowym obciążeniem.
    const line = volumes
      .slice(0, loadingWeeks)
      .filter((_, index) => index % 4 !== 3);
    for (let i = 1; i < line.length; i += 1) {
      expect(line[i]).toBeGreaterThanOrEqual(line[i - 1]);
      expect(line[i] / line[i - 1]).toBeLessThanOrEqual(1.1001);
    }
  });

  it('co czwarty tydzień obciążeniowy jest lżejszy', () => {
    expect(volumes[3]).toBeLessThan(volumes[2]);
    expect(volumes[4]).toBeGreaterThan(volumes[3]);
  });

  it('nie podwaja obecnej objętości, choćby było na to pół roku', () => {
    const long = weeklyVolumes({ ...HALF, eventDate: '2027-10-10' }, phasesFor(52));
    expect(Math.max(...long)).toBeLessThanOrEqual(60000);
  });

  it('przed startem schodzi z objętości', () => {
    const taper = volumes.slice(-3);
    const peak = Math.max(...volumes);
    expect(taper[0]).toBeLessThan(peak * 0.7);
    expect(taper[1]).toBeLessThan(taper[0]);
    expect(taper[2]).toBeLessThan(taper[1]);
  });

  it('bez historii zakłada jeden dystans zawodów na tydzień', () => {
    expect(weeklyVolumes({ ...HALF, weeklyMeters: 0 }, phases)[0]).toBe(21097);
  });
});

describe('assignDays', () => {
  it('długą jednostkę kładzie na ostatni dostępny dzień', () => {
    expect(assignDays([1, 3, 5, 6]).long).toBe(6);
  });

  it('jakość wrzuca w środek tygodnia', () => {
    expect(assignDays([1, 3, 5, 6]).quality).toBe(3);
    expect(assignDays([0, 1, 5, 6]).quality).toBe(1);
  });

  it('przy jednym dniu w tygodniu nie ma miejsca na jakość', () => {
    expect(assignDays([6])).toEqual({ long: 6, quality: null });
  });
});

describe('qualityKind', () => {
  it('baza buduje tempo, szczyt dokłada interwały', () => {
    expect(qualityKind('BASE', 2)).toBe('TEMPO');
    expect(qualityKind('PEAK', 2)).toBe('INTERVALS');
  });

  it('w budowaniu interwały idą co drugi tydzień', () => {
    expect(qualityKind('BUILD', 8)).toBe('INTERVALS');
    expect(qualityKind('BUILD', 9)).toBe('TEMPO');
  });

  it('przed startem nie ma już interwałów', () => {
    expect(qualityKind('TAPER', 16)).toBe('TEMPO');
  });
});

describe('planGoal', () => {
  const weeks = planGoal(HALF, FROM);

  it('układa tyle tygodni, ile zostało do zawodów', () => {
    expect(weeks).toHaveLength(17);
    expect(weeks[0].startDate).toBe('2026-10-12');
    expect(weeks.at(-1)?.startDate).toBe('2027-02-01');
  });

  it('każdy tydzień ma długą jednostkę', () => {
    const loading = weeks.filter((week) => week.phase !== 'RACE');
    expect(loading.every((week) => week.workouts.some((workout) => workout.kind === 'LONG'))).toBe(true);
  });

  it('treningi wypadają tylko w wybrane dni tygodnia', () => {
    const allowed = new Set(HALF.weekDays);
    const planned = weeks.flatMap((week) => week.workouts).filter((workout) => workout.kind !== 'RACE');
    expect(planned.every((workout) => allowed.has(weekdayIndex(workout.plannedDate)))).toBe(true);
  });

  it('zawody stoją w swoim dniu, choćby nie był dniem treningowym', () => {
    const race = weeks.at(-1)?.workouts.at(-1);
    expect(race).toMatchObject({ kind: 'RACE', plannedDate: HALF.eventDate });
    expect(race?.title).toBe('Zawody: Półmaraton Wrocław');
    expect(race?.distanceMeters).toBe(21000);
  });

  it('po zawodach nie planuje już nic', () => {
    const after = weeks
      .flatMap((week) => week.workouts)
      .filter((workout) => workout.plannedDate > HALF.eventDate);
    expect(after).toEqual([]);
  });

  it('liczy tempa z czasu docelowego', () => {
    // 1:45 na półmaratonie to 299 s/km; spokojny bieg o dwadzieścia parę procent wolniej.
    const easy = weeks[0].workouts.find((workout) => workout.kind === 'EASY');
    expect(easy?.paceSeconds).toBe(365);
    const long = weeks[0].workouts.find((workout) => workout.kind === 'LONG');
    expect(long?.paceSeconds).toBe(344);
  });

  it('bez czasu docelowego i bez historii nie wymyśla tempa', () => {
    const blind = planGoal({ ...HALF, targetSeconds: null, bestPaceSeconds: null }, FROM);
    const workouts = blind.flatMap((week) => week.workouts);
    expect(workouts.every((workout) => workout.paceSeconds === null)).toBe(true);
    expect(workouts.every((workout) => workout.durationSeconds === null)).toBe(true);
  });

  it('długa jednostka nie przekracza sufitu dystansu', () => {
    const marathon = planGoal({ ...HALF, distanceMeters: 42195, weeklyMeters: 70000 }, FROM);
    const longest = Math.max(
      ...marathon.flatMap((week) =>
        week.workouts.filter((workout) => workout.kind === 'LONG').map((workout) => workout.distanceMeters ?? 0),
      ),
    );
    expect(longest).toBeLessThanOrEqual(32000);
  });

  it('nie planuje dyscyplin, które nie mierzą się dystansem', () => {
    expect(planGoal({ ...HALF, sport: 'STRENGTH' }, FROM)).toEqual([]);
    expect(planGoal({ ...HALF, sport: 'OTHER' }, FROM)).toEqual([]);
  });

  it('po terminie zawodów nie ma czego planować', () => {
    expect(planGoal(HALF, '2027-03-01')).toEqual([]);
  });
});
