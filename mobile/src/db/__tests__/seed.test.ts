/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { count, eq } from 'drizzle-orm';

import * as schema from '../schema';
import { seedDatabase } from '../seed';
import { seedEnduranceTemplates, seedExercises, seedTemplates } from '../seed-data';
import { createTestDb as createDb } from '../test-utils';

describe('seedDatabase', () => {
  it('wgrywa katalog ćwiczeń i szablony', () => {
    const db = createDb();
    expect(seedDatabase(db)).toBe(true);

    expect(db.select({ n: count() }).from(schema.exercises).get()?.n).toBe(seedExercises.length);
    const templates = db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.isTemplate, true)).all();
    expect(templates.map((t) => t.title).sort()).toEqual(
      [...seedTemplates, ...seedEnduranceTemplates].map((t) => t.title).sort(),
    );

    const expectedPlanRows = seedTemplates.reduce((n, t) => n + t.exercises.length, 0);
    expect(db.select({ n: count() }).from(schema.planExercises).get()?.n).toBe(expectedPlanRows);

    const expectedSegments = seedEnduranceTemplates.reduce((n, t) => n + t.segments.length, 0);
    expect(db.select({ n: count() }).from(schema.planSegments).get()?.n).toBe(expectedSegments);
  });

  it('wiąże odcinki szablonu z jego grupą powtórzeń', () => {
    const db = createDb();
    seedDatabase(db);

    const plan = db
      .select()
      .from(schema.workoutPlans)
      .where(eq(schema.workoutPlans.title, 'Interwały 6×400 m'))
      .get()!;
    const segments = db
      .select()
      .from(schema.planSegments)
      .where(eq(schema.planSegments.planId, plan.id))
      .all();
    const group = segments.find((segment) => segment.kind === 'REPEAT')!;

    expect(plan.sport).toBe('RUNNING');
    expect(group.repeatCount).toBe(6);
    expect(segments.filter((segment) => segment.parentId === group.id).map((s) => s.kind).sort()).toEqual([
      'RECOVERY',
      'WORK',
    ]);
  });

  it('ma spójne odcinki w szablonach wytrzymałościowych', () => {
    // Zbieramy usterki zamiast przerywać na pierwszej — przy wpadce widać od razu, który szablon.
    const problems: string[] = [];
    for (const template of seedEnduranceTemplates) {
      let openGroup = false;
      for (const segment of template.segments) {
        const where = `${template.title} / ${segment.kind}`;
        const check = (ok: boolean, what: string) => {
          if (!ok) problems.push(`${where}: ${what}`);
        };

        // Odcinek w grupie musi iść zaraz za nią — seed wiąże go z ostatnio wstawioną grupą.
        if (segment.inRepeat) check(openGroup, 'odcinek w grupie bez grupy przed sobą');
        if (segment.kind === 'REPEAT') {
          check((segment.repeatCount ?? 0) > 1, 'grupa powtórzeń bez sensownej liczby powtórzeń');
          openGroup = true;
        }

        if (segment.durationType === 'DISTANCE') {
          check((segment.distanceMeters ?? 0) > 0, 'odcinek na dystans bez dystansu');
          check(segment.durationSeconds === undefined, 'odcinek na dystans ma też czas');
        }
        if (segment.durationType === 'TIME') {
          check((segment.durationSeconds ?? 0) > 0, 'odcinek na czas bez czasu');
          check(segment.distanceMeters === undefined, 'odcinek na czas ma też dystans');
        }

        if (segment.targetType === 'PACE' || segment.targetType === 'HEART_RATE') {
          // Tempo liczymy w sekundach na kilometr, więc niższa granica to szybszy koniec zakresu.
          check(
            segment.targetLow !== undefined && segment.targetHigh !== undefined && segment.targetLow < segment.targetHigh,
            'zakres celu nie rośnie',
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('jest idempotentne', () => {
    const db = createDb();
    seedDatabase(db);
    expect(seedDatabase(db)).toBe(false);
    expect(db.select({ n: count() }).from(schema.exercises).get()?.n).toBe(seedExercises.length);
  });

  describe('szablony po zmianach użytkownika', () => {
    const reseed = (db: ReturnType<typeof createDb>) => {
      db.update(schema.appSettings).set({ value: '0' }).where(eq(schema.appSettings.key, 'seed_version')).run();
      return seedDatabase(db);
    };
    const templateTitles = (db: ReturnType<typeof createDb>) =>
      db
        .select({ title: schema.workoutPlans.title })
        .from(schema.workoutPlans)
        .where(eq(schema.workoutPlans.isTemplate, true))
        .all()
        .map((t) => t.title);

    it('nie przywraca usuniętego szablonu', () => {
      const db = createDb();
      seedDatabase(db);
      const victim = seedTemplates[0].title;
      db.delete(schema.workoutPlans).where(eq(schema.workoutPlans.title, victim)).run();

      reseed(db);

      expect(templateTitles(db)).not.toContain(victim);
    });

    it('nie dorabia bliźniaka pod starą nazwą po zmianie tytułu', () => {
      const db = createDb();
      seedDatabase(db);
      const before = seedEnduranceTemplates[0].title;
      db.update(schema.workoutPlans)
        .set({ title: 'Mój własny tytuł' })
        .where(eq(schema.workoutPlans.title, before))
        .run();

      reseed(db);

      const titles = templateTitles(db);
      expect(titles).toContain('Mój własny tytuł');
      expect(titles).not.toContain(before);
    });

    it('dogrywa szablon, którego jeszcze nie dostarczył', () => {
      const db = createDb();
      seedDatabase(db);
      // Tak wygląda szablon dopisany do seed-data po stronie aplikacji: nie ma go ani w bazie,
      // ani na liście dostarczonych.
      const fresh = seedTemplates[1].title;
      db.delete(schema.workoutPlans).where(eq(schema.workoutPlans.title, fresh)).run();
      db.delete(schema.seededTemplates).where(eq(schema.seededTemplates.title, fresh)).run();

      reseed(db);

      expect(templateTitles(db)).toContain(fresh);
    });
  });

  it('nie dubluje rekordów przy ponownym seedzie po zmianie wersji', () => {
    const db = createDb();
    seedDatabase(db);
    db.update(schema.appSettings).set({ value: '0' }).where(eq(schema.appSettings.key, 'seed_version')).run();
    expect(seedDatabase(db)).toBe(true);
    expect(db.select({ n: count() }).from(schema.exercises).get()?.n).toBe(seedExercises.length);
    expect(db.select({ n: count() }).from(schema.workoutPlans).get()?.n).toBe(
      seedTemplates.length + seedEnduranceTemplates.length,
    );
  });
});
