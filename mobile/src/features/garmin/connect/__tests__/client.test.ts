/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { describeLoginFailure, parseQuery } from '../client';
import { isExpired } from '../tokens';

describe('parseQuery', () => {
  it('rozbiera odpowiedź Garmina z tokenem', () => {
    expect(parseQuery('oauth_token=abc&oauth_token_secret=def%2Fghi&mfa_token=xyz')).toEqual({
      oauth_token: 'abc',
      oauth_token_secret: 'def/ghi',
      mfa_token: 'xyz',
    });
  });

  it('plus w wartości to spacja', () => {
    expect(parseQuery('a=x+y').a).toBe('x y');
  });

  it('pole bez wartości nie wywraca rozbioru', () => {
    expect(parseQuery('a&b=1')).toEqual({ a: '', b: '1' });
  });
});

describe('isExpired', () => {
  const now = 1_700_000_000_000;
  const at = (expiresAt: number) => isExpired({ accessToken: 't', expiresAt }, now);

  it('token ważny jeszcze godzinę jest dobry', () => {
    expect(at(1_700_000_000 + 3600)).toBe(false);
  });

  it('token po terminie jest przeterminowany', () => {
    expect(at(1_700_000_000 - 1)).toBe(true);
  });

  it('token na ostatnich sekundach też odrzucamy, bo nie zdąży dolecieć', () => {
    expect(at(1_700_000_000 + 30)).toBe(true);
  });
});

describe('describeLoginFailure', () => {
  it('powtarza komunikat Garmina, gdy go przysłał', () => {
    expect(describeLoginFailure({ responseStatus: { message: 'Konto zablokowane' } }, 401)).toBe(
      'Konto zablokowane',
    );
  });

  it('bez komunikatu tłumaczy kod odpowiedzi', () => {
    expect(describeLoginFailure({}, 401)).toContain('e-mail');
    expect(describeLoginFailure({}, 429)).toContain('kilka minut');
    expect(describeLoginFailure({}, 500)).toContain('500');
  });
});
