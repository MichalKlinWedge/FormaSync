/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { buildFoodPrompt, FoodReplyError, parseFoodReply } from '../ai';

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: 'Owsianka z bananem',
    basis: 'SERVING',
    kcal: 520,
    protein: 18,
    carbs: 70,
    fat: 16,
    servingGrams: 380,
    note: 'Przyjąłem 60 g płatków i jednego banana.',
    ...over,
  });

describe('buildFoodPrompt', () => {
  it('wkłada opis użytkownika i żąda samego JSON-a', () => {
    const prompt = buildFoodPrompt('  dwa jajka i kromka chleba  ');
    expect(prompt).toContain('dwa jajka i kromka chleba');
    expect(prompt).toContain('Odpowiedz samym JSON-em');
    expect(prompt).toContain('"basis"');
  });
});

describe('buildFoodPrompt ze zdjęciem', () => {
  it('bez zdjęcia nie mówi o zdjęciu ani słowem', () => {
    const prompt = buildFoodPrompt('owsianka z bananem');
    expect(prompt).not.toMatch(/zdjęci/i);
  });

  it('ze zdjęciem rozdziela role: obraz mówi co, opis ile', () => {
    const prompt = buildFoodPrompt('duża miska', { photo: true });
    expect(prompt).toContain('duża miska');
    expect(prompt).toContain('Po nim rozpoznaj składniki; opis mówi o ilości.');
    expect(prompt).toContain('Wielkość porcji oceniaj po tym, co widać obok jedzenia');
    // Oleju i cukru nie widać na zdjęciu — model ma ich nie dokładać z wyobraźni.
    expect(prompt).toContain('Nie zgaduj tego, czego na zdjęciu nie widać');
    expect(prompt).toContain('trzymaj się opisu');
  });
});

describe('parseFoodReply', () => {
  it('czyta wersję roboczą produktu', () => {
    const estimate = parseFoodReply(reply());
    expect(estimate.draft).toMatchObject({
      name: 'Owsianka z bananem',
      basis: 'SERVING',
      kcal: 520,
      proteinG: 18,
      carbsG: 70,
      fatG: 16,
      servingGrams: 380,
    });
    expect(estimate.note).toBe('Przyjąłem 60 g płatków i jednego banana.');
    expect(estimate.warning).toBeNull();
  });

  it('radzi sobie ze znacznikami kodu i zdaniem wstępu', () => {
    const wrapped = `Oto wynik:\n\`\`\`json\n${reply()}\n\`\`\``;
    expect(parseFoodReply(wrapped).draft.kcal).toBe(520);
  });

  it('przy produkcie na 100 g nie zostawia masy porcji', () => {
    const estimate = parseFoodReply(reply({ basis: 'G100', kcal: 250, servingGrams: 400 }));
    expect(estimate.draft).toMatchObject({ basis: 'G100', kcal: 250, servingGrams: null });
  });

  it('bez nazwy bierze słowa użytkownika', () => {
    const estimate = parseFoodReply(reply({ name: null }), 'kanapka z serem');
    expect(estimate.draft.name).toBe('kanapka z serem');
  });

  it('przyjmuje liczbę w cudzysłowie i z przecinkiem', () => {
    const estimate = parseFoodReply(reply({ kcal: '520', protein: '18,5' }));
    expect(estimate.draft).toMatchObject({ kcal: 520, proteinG: 18.5 });
  });

  it('odrzuca odpowiedź bez kalorii i nie z tego świata', () => {
    expect(() => parseFoodReply(reply({ kcal: null }))).toThrow(FoodReplyError);
    expect(() => parseFoodReply(reply({ kcal: 0 }))).toThrow(FoodReplyError);
    expect(() => parseFoodReply(reply({ kcal: 12000 }))).toThrow(FoodReplyError);
    // Na 100 g granica jest ciaśniejsza: czysty tłuszcz to 900 kcal.
    expect(() => parseFoodReply(reply({ basis: 'G100', kcal: 1500 }))).toThrow(FoodReplyError);
  });

  it('odrzuca tekst, który nie jest JSON-em', () => {
    expect(() => parseFoodReply('Nie mogę tego oszacować.')).toThrow(FoodReplyError);
    expect(() => parseFoodReply('{ to nie JSON }')).toThrow(FoodReplyError);
  });

  it('makroskładnik nie z tego świata zeruje, zamiast go wpuszczać', () => {
    const estimate = parseFoodReply(reply({ basis: 'G100', kcal: 250, protein: 400 }));
    expect(estimate.draft.proteinG).toBeNull();
  });

  it('mówi, gdy makroskładniki nie trzymają się kalorii', () => {
    // 10 × 4 + 10 × 4 + 10 × 9 to 170 kcal, a model podał 900.
    const estimate = parseFoodReply(reply({ kcal: 900, protein: 10, carbs: 10, fat: 10 }));
    expect(estimate.warning).toContain('170 kcal');
    expect(estimate.warning).toContain('900');
  });

  it('nie czepia się drobnego rozjazdu', () => {
    // 18 × 4 + 70 × 4 + 16 × 9 to 496 kcal przy podanych 520 — mieści się w zapasie.
    expect(parseFoodReply(reply()).warning).toBeNull();
  });
});
