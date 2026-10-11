/**
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';

import { lookupBarcode, normalizeBarcode, OffError, productToDraft, productUrl } from '../off';

/** Kształt odpowiedzi jest przepisany z prawdziwego zapytania do Open Food Facts. */
const nutella = {
  code: '3017620422003',
  product_name: 'Nutella',
  brands: 'Nutella, Ferrero',
  quantity: '400 g',
  product_quantity: 400,
  serving_size: '15 g',
  serving_quantity: 15,
  nutriments: {
    'energy-kcal_100g': 539,
    energy_100g: 2252,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
  },
};

describe('normalizeBarcode', () => {
  it('przyjmuje długości z opakowań, odrzuca resztę', () => {
    expect(normalizeBarcode('3017620422003')).toBe('3017620422003');
    expect(normalizeBarcode('5901234')).toBeNull();
    expect(normalizeBarcode('https://example.com')).toBeNull();
  });

  it('czyści to, co czytnik dołożył', () => {
    expect(normalizeBarcode(' 301-762-0422003 ')).toBe('3017620422003');
  });
});

describe('productToDraft', () => {
  it('składa produkt na 100 g z wartościami i miarkami', () => {
    const { draft, note } = productToDraft(nutella, '3017620422003');
    expect(draft).toMatchObject({
      name: 'Nutella',
      basis: 'G100',
      kcal: 539,
      proteinG: 6.3,
      carbsG: 57.5,
      fatG: 30.9,
    });
    // Marka równa nazwie nie wnosi nic — druga z listy to właściciel, nie produkt.
    expect(draft.brand).toBeNull();
    expect(draft.portions).toEqual([
      { name: '15 g', amount: 15 },
      { name: 'całe opakowanie (400 g)', amount: 400 },
    ]);
    expect(note).toBeNull();
  });

  it('kilodżule przelicza sam, gdy kalorii nie podano', () => {
    const product = { ...nutella, nutriments: { energy_100g: 2252 } };
    expect(productToDraft(product, '3017620422003').draft).toMatchObject({
      kcal: 538, // 2252 kJ / 4,184
      proteinG: null,
      fatG: null,
    });
  });

  it('przy wartościach na 100 ml mówi, co przyjęliśmy', () => {
    const juice = {
      product_name_pl: 'Nektar czerwony grejpfrut',
      brands: 'Tymbark',
      nutrition_data_per: '100ml',
      quantity: '1 l',
      product_quantity: 1000,
      nutriments: { 'energy-kcal_100g': 42, carbohydrates_100g: 9.9, proteins_100g: 0, fat_100g: 0 },
    };
    const { draft, note } = productToDraft(juice, '5900334013774');
    expect(draft).toMatchObject({ name: 'Nektar czerwony grejpfrut', brand: 'Tymbark', kcal: 42 });
    expect(draft.portions).toEqual([{ name: 'całe opakowanie (1 l)', amount: 1000 }]);
    expect(note).toBe('Wartości są na 100 ml — przyjmujemy, że tyle waży 100 g.');
  });

  it('woli nazwę polską, gdy baza ją ma', () => {
    const product = { ...nutella, product_name_pl: 'Krem orzechowy' };
    expect(productToDraft(product, '3017620422003').draft.name).toBe('Krem orzechowy');
  });

  it('nie przyjmuje wpisu bez nazwy ani bez wartości', () => {
    expect(() => productToDraft({ nutriments: { 'energy-kcal_100g': 100 } }, '123')).toThrow(OffError);
    expect(() => productToDraft({ product_name: 'Coś', nutriments: {} }, '123')).toThrow(OffError);
  });

  it('odrzuca liczby niemożliwe, zamiast je przepisać', () => {
    // 2000 kcal na 100 g nie istnieje — czysty tłuszcz ma 900. Białka też nie ma więcej niż 100 g.
    const broken = {
      product_name: 'Błąd w bazie',
      nutriments: { 'energy-kcal_100g': 2000, proteins_100g: 400, fat_100g: 12 },
    };
    expect(() => productToDraft(broken, '123')).toThrow(OffError);

    const partly = { product_name: 'Pół błędu', nutriments: { 'energy-kcal_100g': 250, proteins_100g: 400 } };
    expect(productToDraft(partly, '123').draft).toMatchObject({ kcal: 250, proteinG: null });
  });

  it('pomija miarki, których baza nie zna', () => {
    const bare = { product_name: 'Bez miarek', nutriments: { 'energy-kcal_100g': 250 } };
    expect(productToDraft(bare, '123').draft.portions).toEqual([]);
  });
});

describe('lookupBarcode', () => {
  const reply = (body: unknown, status = 200) =>
    jest.fn(async () =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response,
    ) as unknown as typeof fetch;

  it('pyta o jeden kod i przedstawia się bazie', async () => {
    const fetchImpl = reply({ product: nutella, status: 'success' });
    const { draft } = await lookupBarcode('3017620422003', fetchImpl);

    expect(draft.name).toBe('Nutella');
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(productUrl('3017620422003'));
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^FormaSync\//);
  });

  it('nieznany kod tłumaczy na zdanie, nie na błąd sieci', async () => {
    await expect(lookupBarcode('3017620422003', reply({ status: 'failure' }, 404))).rejects.toThrow(
      /nie ma w Open Food Facts/,
    );
  });

  it('prośbę o przerwę i awarię bazy rozróżnia', async () => {
    await expect(lookupBarcode('301762042200', reply({}, 429))).rejects.toThrow(/przerwy/);
    await expect(lookupBarcode('301762042200', reply({}, 503))).rejects.toThrow(/503/);
  });

  it('brak sieci mówi wprost i podsuwa wpis z ręki', async () => {
    const offline = jest.fn(async () => {
      throw new Error('Network request failed');
    }) as unknown as typeof fetch;
    await expect(lookupBarcode('3017620422003', offline)).rejects.toThrow(/Brak połączenia/);
  });

  it('odpowiedź bez produktu traktuje jak brak kodu', async () => {
    await expect(lookupBarcode('3017620422003', reply({ status: 'success' }))).rejects.toThrow(
      /nie ma w Open Food Facts/,
    );
  });
});
