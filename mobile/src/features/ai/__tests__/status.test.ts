import { describe, expect, it } from '@jest/globals';

import { describeStatus } from '../status';

/**
 * Odmowa dostawcy przetłumaczona na radę.
 *
 * Najważniejszy jest tu przypadek przeciążonego modelu: wyszedł z prawdziwej awarii, w której
 * Google odmówił jednemu wariantowi, a na telefonie wyglądało to na zepsutą funkcję.
 */

describe('describeStatus', () => {
  it('przeciążony model nazywa po imieniu i proponuje inny', () => {
    const message = describeStatus(
      'GEMINI',
      503,
      'This model is currently experiencing high demand.',
      'gemini-3.5-flash',
    );

    expect(message).toContain('gemini-3.5-flash');
    expect(message).toContain('Google');
    expect(message).toContain('inny model');
  });

  it('tak samo traktuje przeciążenie zgłoszone kodem 529 przez Anthropic', () => {
    expect(describeStatus('CLAUDE', 529, 'overloaded', 'claude-sonnet-5-5')).toContain(
      'claude-sonnet-5-5',
    );
  });

  it('przy liście modeli, gdzie nazwy jeszcze nie ma, mówi o samym dostawcy', () => {
    expect(describeStatus('GEMINI', 503, 'high demand', '')).toBe(
      'Gemini chwilowo nie odpowiada. Spróbuj później.',
    );
  });

  it('awarii serwera nie nazywa przeciążeniem', () => {
    expect(describeStatus('OPENAI', 500, 'internal error', 'gpt-test')).toBe(
      'ChatGPT chwilowo nie odpowiada. Spróbuj później.',
    );
  });

  it('nieważny klucz zostaje nieważnym kluczem', () => {
    expect(describeStatus('CLAUDE', 401, 'invalid x-api-key', 'claude-sonnet-5-5')).toBe(
      'Klucz do Claude jest nieważny albo bez uprawnień.',
    );
  });

  it('nieistniejący model odsyła po listę', () => {
    const message = describeStatus('GEMINI', 404, 'not found', 'gemini-wymyslony');

    expect(message).toContain('gemini-wymyslony');
    expect(message).toContain('listę modeli');
  });
});
