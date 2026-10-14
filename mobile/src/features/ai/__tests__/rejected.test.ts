/**
 * @jest-environment node
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { forgetRejected, rejectedModels, rememberRejected, withoutRejected } from '../rejected';

/**
 * Pamięć odmów: które warianty ten klucz odrzucił.
 *
 * Z góry nie da się tego sprawdzić — lista od dostawcy pokazuje też modele, które odpowiadają
 * dopiero odmową. Dlatego uczymy się z nich i tego uczenia pilnujemy testem.
 */

jest.mock('@/db/client', () => {
  const utils = jest.requireActual<typeof import('@/db/test-utils')>('@/db/test-utils');
  return { db: utils.createTestDb() };
});

const model = (id: string) => ({ id, label: id });

beforeEach(() => {
  forgetRejected('GEMINI');
  forgetRejected('CLAUDE');
});

describe('pamięć odrzuconych modeli', () => {
  it('zaczyna pusta', () => {
    expect(rejectedModels('GEMINI')).toEqual([]);
  });

  it('zapamiętuje odmowę i sprowadza nazwę do identyfikatora', () => {
    rememberRejected('GEMINI', 'models/Gemini-2.5-Flash');

    expect(rejectedModels('GEMINI')).toEqual(['gemini-2.5-flash']);
  });

  it('tej samej odmowy nie zapisuje dwa razy', () => {
    rememberRejected('GEMINI', 'gemini-2.5-flash');
    rememberRejected('GEMINI', 'gemini-2.5-flash');

    expect(rejectedModels('GEMINI')).toEqual(['gemini-2.5-flash']);
  });

  it('trzyma dostawców osobno, bo klucze są osobne', () => {
    rememberRejected('GEMINI', 'gemini-2.5-flash');

    expect(rejectedModels('CLAUDE')).toEqual([]);
  });

  it('odsiewa z listy to, co dostawca już odrzucił', () => {
    rememberRejected('GEMINI', 'gemini-2.5-flash');

    const left = withoutRejected('GEMINI', [model('gemini-2.5-flash'), model('gemini-3.8-flash')]);

    expect(left.map((entry) => entry.id)).toEqual(['gemini-3.8-flash']);
  });

  it('po zapomnieniu lista wraca w całości', () => {
    rememberRejected('GEMINI', 'gemini-2.5-flash');
    forgetRejected('GEMINI');

    expect(withoutRejected('GEMINI', [model('gemini-2.5-flash')])).toHaveLength(1);
  });

  it('pustej nazwy nie zapisuje, bo nie da się jej potem odsiać', () => {
    rememberRejected('GEMINI', '   ');

    expect(rejectedModels('GEMINI')).toEqual([]);
  });
});
