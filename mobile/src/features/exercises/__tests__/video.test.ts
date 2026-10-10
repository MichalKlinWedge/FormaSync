/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { isYouTube, normalizeVideoUrl, videoLabel, VideoUrlError, videoSearchUrl, videoUrlFor } from '../video';

describe('videoSearchUrl', () => {
  it('szuka po nazwie ćwiczenia razem z techniką', () => {
    const url = videoSearchUrl('Przysiad ze sztangą');
    expect(url).toBe('https://www.youtube.com/results?search_query=Przysiad%20ze%20sztang%C4%85%20technika%20wykonania');
  });

  it('koduje znaki, które rozbiłyby adres', () => {
    // Nawiasy i plusy w nazwach („Brzuszki (crunch)”) muszą trafić do zapytania, a nie do składni.
    expect(videoSearchUrl('Brzuszki (crunch)')).toContain('Brzuszki%20(crunch)');
    expect(videoSearchUrl('Pompki & dipy')).toContain('%26');
  });
});

describe('videoUrlFor', () => {
  it('bez przypiętego filmu otwiera wyszukiwanie', () => {
    expect(videoUrlFor('Martwy ciąg', null)).toBe(videoSearchUrl('Martwy ciąg'));
  });

  it('z przypiętym filmem otwiera właśnie jego', () => {
    expect(videoUrlFor('Martwy ciąg', 'https://youtu.be/abc')).toBe('https://youtu.be/abc');
  });

  it('pusty zapis traktuje jak brak', () => {
    expect(videoUrlFor('Martwy ciąg', '   ')).toBe(videoSearchUrl('Martwy ciąg'));
  });
});

describe('normalizeVideoUrl', () => {
  it('przyjmuje adres https i obcina białe znaki z wklejenia', () => {
    expect(normalizeVideoUrl('  https://youtu.be/abc  ')).toBe('https://youtu.be/abc');
  });

  it('puste pole znaczy „wróć do wyszukiwania”, a nie błąd', () => {
    expect(normalizeVideoUrl('')).toBeNull();
    expect(normalizeVideoUrl('   ')).toBeNull();
  });

  it('odrzuca to, czego nie można bezpiecznie otworzyć', () => {
    // Stąd otwieramy przeglądarkę, więc nie wpuszczamy byle czego.
    expect(() => normalizeVideoUrl('youtube.com/watch?v=abc')).toThrow(VideoUrlError);
    expect(() => normalizeVideoUrl('http://youtube.com/watch?v=abc')).toThrow(VideoUrlError);
    expect(() => normalizeVideoUrl('javascript:alert(1)')).toThrow(VideoUrlError);
  });
});

describe('isYouTube', () => {
  it('rozpoznaje adresy YouTube razem ze skróconymi i mobilnymi', () => {
    expect(isYouTube('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isYouTube('https://youtu.be/abc')).toBe(true);
    expect(isYouTube('https://m.youtube.com/watch?v=abc')).toBe(true);
  });

  it('nie daje się nabrać na podobną domenę', () => {
    expect(isYouTube('https://youtube.com.przyklad.pl/film')).toBe(false);
    expect(isYouTube('https://vimeo.com/12345')).toBe(false);
  });
});

describe('videoLabel', () => {
  it('nazywa przycisk tym, czym naprawdę jest', () => {
    expect(videoLabel(null)).toContain('Szukaj');
    expect(videoLabel('https://youtu.be/abc')).toContain('YouTube');
    expect(videoLabel('https://vimeo.com/1')).toBe('Obejrzyj film');
  });
});
