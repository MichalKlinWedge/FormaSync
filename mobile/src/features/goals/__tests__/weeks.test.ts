/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { planWeeks } from '../weeks';

/**
 * Numerowanie tygodni planu. Numer brany z zapisanego `weekIndex` kłamał po korekcie w trakcie
 * cyklu: nowe jednostki przychodziły liczone od dnia korekty i wpadały do tygodnia pierwszego,
 * razem z jednostkami z pierwszego układania.
 */

const on = (plannedDate: string) => ({ plannedDate });

describe('planWeeks', () => {
  it('bez jednostek nie ma tygodni', () => {
    expect(planWeeks([])).toEqual([]);
  });

  it('zbiera dni jednego tygodnia pod jego poniedziałkiem', () => {
    // 13.10 to wtorek, 18.10 — niedziela tego samego tygodnia.
    const weeks = planWeeks([on('2026-10-13'), on('2026-10-18')]);

    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ startDate: '2026-10-12', number: 1 });
    expect(weeks[0].workouts).toHaveLength(2);
  });

  it('numeruje od pierwszego tygodnia planu, nie od pierwszej jednostki w wywołaniu', () => {
    const weeks = planWeeks([on('2026-11-17'), on('2026-10-13'), on('2026-10-20')]);

    expect(weeks.map((week) => week.number)).toEqual([1, 2, 6]);
    expect(weeks.map((week) => week.startDate)).toEqual(['2026-10-12', '2026-10-19', '2026-11-16']);
  });

  it('tydzień bez jednostek zostawia dziurę w numeracji', () => {
    // Przerwa jest częścią planu; zwarta numeracja udawałaby ciągłość, której nie było.
    const weeks = planWeeks([on('2026-10-13'), on('2026-10-27')]);

    expect(weeks.map((week) => week.number)).toEqual([1, 3]);
  });

  it('nie przestawia jednostek w tygodniu', () => {
    const weeks = planWeeks([on('2026-10-13'), on('2026-10-15')]);

    expect(weeks[0].workouts.map((workout) => workout.plannedDate))
      .toEqual(['2026-10-13', '2026-10-15']);
  });

  it('liczy tygodnie przez przestawienie zegarków', () => {
    // 25.10.2026 to koniec czasu letniego — doba ma wtedy 25 godzin.
    const weeks = planWeeks([on('2026-10-20'), on('2026-10-27'), on('2026-11-03')]);

    expect(weeks.map((week) => week.number)).toEqual([1, 2, 3]);
  });
});
