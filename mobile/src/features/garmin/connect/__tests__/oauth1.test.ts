/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { authorizationHeader, percentEncode, sign, signatureBaseString } from '../oauth1';

describe('percentEncode', () => {
  it('koduje znaki, które norma zalicza do zarezerwowanych', () => {
    // encodeURIComponent zostawiłby te pięć nietkniętych — RFC 5849 §3.6 każe je zakodować.
    expect(percentEncode("!'()*")).toBe('%21%27%28%29%2A');
  });

  it('nie rusza znaków niezarezerwowanych', () => {
    expect(percentEncode('aZ09-._~')).toBe('aZ09-._~');
  });

  it('spacja to %20, a nie plus', () => {
    expect(percentEncode('r b')).toBe('r%20b');
  });
});

describe('signatureBaseString', () => {
  it('odtwarza przykład z RFC 5849 §3.4.1.1', () => {
    const params: [string, string][] = [
      ['b5', '=%3D'],
      ['a3', 'a'],
      ['c@', ''],
      ['a2', 'r b'],
      ['oauth_consumer_key', '9djdj82h48djs9d2'],
      ['oauth_token', 'kkk9d7dh3k39sjv7'],
      ['oauth_signature_method', 'HMAC-SHA1'],
      ['oauth_timestamp', '137131201'],
      ['oauth_nonce', '7d8f3e4a'],
      ['c2', ''],
      ['a3', '2 q'],
    ];

    expect(signatureBaseString('POST', 'http://example.com/request', params)).toBe(
      'POST&http%3A%2F%2Fexample.com%2Frequest&a2%3Dr%2520b%26a3%3D2%2520q%26a3%3Da%26b5%3D%253D%25253D' +
        '%26c%2540%3D%26c2%3D%26oauth_consumer_key%3D9djdj82h48djs9d2%26oauth_nonce%3D7d8f3e4a' +
        '%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D137131201%26oauth_token%3Dkkk9d7dh3k39sjv7',
    );
  });

  it('adres w podpisie jest bez części zapytania', () => {
    // Zapytanie nie znika — dokłada je authorizationHeader do listy parametrów (§3.4.1.2).
    const base = signatureBaseString('GET', 'https://example.com/p?ticket=ST-1', [
      ['oauth_nonce', 'n'],
    ]);
    expect(base).toContain('https%3A%2F%2Fexample.com%2Fp&');
    expect(base).not.toContain('ST-1');
  });
});

describe('sign', () => {
  it('daje podpis z przykładu Twittera dla HMAC-SHA1', () => {
    // Wektor z dokumentacji OAuth 1.0a, liczony na tych samych danych co w normie.
    const signature = sign(
      'POST',
      'https://api.twitter.com/1/statuses/update.json',
      [
        ['status', 'Hello Ladies + Gentlemen, a signed OAuth request!'],
        ['include_entities', 'true'],
        ['oauth_consumer_key', 'xvz1evFS4wEEPTGEFPHBog'],
        ['oauth_nonce', 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg'],
        ['oauth_signature_method', 'HMAC-SHA1'],
        ['oauth_timestamp', '1318622958'],
        ['oauth_token', '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb'],
        ['oauth_version', '1.0'],
      ],
      {
        consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
        consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
        token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
        tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
      },
    );
    expect(signature).toBe('tnnArxj06cWHq44gCs1OSKk/jLY=');
  });
});

describe('authorizationHeader', () => {
  const creds = { consumerKey: 'ck', consumerSecret: 'cs', token: 't', tokenSecret: 'ts' };

  it('wypisuje pola OAuth w nagłówku, z podpisem na końcu', () => {
    const header = authorizationHeader('GET', 'https://example.com/a', creds, {
      nonce: 'abc',
      timestamp: 1700000000,
    });
    expect(header).toMatch(/^OAuth oauth_consumer_key="ck", /);
    expect(header).toContain('oauth_nonce="abc"');
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).toContain('oauth_timestamp="1700000000"');
    expect(header).toContain('oauth_token="t"');
    expect(header).toMatch(/oauth_signature="[^"]+"$/);
  });

  it('pola formularza zmieniają podpis, bo też są podpisywane', () => {
    const options = { nonce: 'abc', timestamp: 1700000000 };
    const without = authorizationHeader('POST', 'https://example.com/a', creds, options);
    const withBody = authorizationHeader('POST', 'https://example.com/a', creds, {
      ...options,
      body: { audience: 'GARMIN' },
    });
    expect(withBody).not.toBe(without);
  });

  it('parametry z adresu wchodzą do podpisu', () => {
    const options = { nonce: 'abc', timestamp: 1700000000 };
    expect(authorizationHeader('GET', 'https://example.com/a?ticket=ST-1', creds, options)).not.toBe(
      authorizationHeader('GET', 'https://example.com/a?ticket=ST-2', creds, options),
    );
  });

  it('bez tokenu nie wstawia oauth_token', () => {
    const header = authorizationHeader(
      'GET',
      'https://example.com/a',
      { consumerKey: 'ck', consumerSecret: 'cs' },
      { nonce: 'abc', timestamp: 1 },
    );
    expect(header).not.toContain('oauth_token=');
  });
});
