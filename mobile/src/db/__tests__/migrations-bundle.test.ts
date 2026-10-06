/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Migracje żyją w trzech miejscach naraz: plik `.sql`, wpis w dzienniku i paczka
 * `migrations.js`, z której czyta je aplikacja. Pozostałe testy wczytują je z katalogu,
 * więc brak wpisu w paczce przechodził przez nie bez śladu i wywracał aplikację dopiero
 * na urządzeniu — „Missing migration”. Ten test pilnuje, żeby trzy miejsca się zgadzały.
 */

const folder = path.join(__dirname, '../../../drizzle');
const journal = JSON.parse(
  fs.readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8'),
) as { entries: { idx: number; tag: string }[] };
const bundle = fs.readFileSync(path.join(folder, 'migrations.js'), 'utf8');

describe('paczka migracji', () => {
  it.each(journal.entries.map((entry) => [entry.tag, entry.idx] as const))(
    '%s jest w paczce, nie tylko w dzienniku',
    (tag, idx) => {
      const name = `m${String(idx).padStart(4, '0')}`;
      expect(bundle).toContain(`import ${name} from './${tag}.sql'`);
      // Sam import nie wystarczy — migracja musi jeszcze trafić do mapy eksportowanej na końcu.
      expect(bundle).toMatch(new RegExp(`\\b${name}\\b[,\\s]*\\n?\\s*(?:m\\d{4}|\\})`));
    },
  );

  it('każdy plik .sql w katalogu ma wpis w dzienniku', () => {
    const files = fs
      .readdirSync(folder)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => file.replace(/\.sql$/, ''))
      .sort();
    expect(files).toEqual(journal.entries.map((entry) => entry.tag).sort());
  });

  it('numery w dzienniku idą po kolei, bez dziur', () => {
    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_entry, index) => index),
    );
  });
});
