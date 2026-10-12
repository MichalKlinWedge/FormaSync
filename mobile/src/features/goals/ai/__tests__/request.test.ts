/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { contentParts } from '../request';

describe('contentParts', () => {
  it('samo polecenie to jedna część z tekstem', () => {
    expect(contentParts('Policz kalorie')).toEqual([{ text: 'Policz kalorie' }]);
    expect(contentParts('Policz kalorie', null)).toEqual([{ text: 'Policz kalorie' }]);
  });

  it('zdjęcie idzie przed tekstem, bo polecenie się do niego odwołuje', () => {
    const parts = contentParts('Na zdjęciu jest to samo jedzenie', {
      mimeType: 'image/jpeg',
      data: 'QUJD',
    });

    expect(parts).toEqual([
      { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } },
      { text: 'Na zdjęciu jest to samo jedzenie' },
    ]);
  });
});
