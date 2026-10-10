/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { bestEffort, type Split } from '../records';

/**
 * Sprawdzenie `bestEffort` przez porównanie z przeglądem wszystkich możliwych okien.
 *
 * Powód: rekordy wychodziły szybsze, niż mogły, a Garmin tych samych danych tak nie czyta.
 * Zanim znowu dokręcę próg, trzeba rozstrzygnąć, czy to algorytm źle sumuje okno. Wzorzec liczy
 * to samo w sposób nieoptymalny, ale oczywisty — jeśli oba zgadzają się na tysiącu losowych
 * zestawów, algorytm jest poza podejrzeniem.
 */

/**
 * Wzorzec: przegląda każde spójne okno i bierze najszybsze z tych, które sięgają dystansu.
 * Odcinek z dystansem bez czasu przerywa okno — tak samo jak w `bestEffort`, bo to część
 * definicji rekordu, a nie szczegół implementacji.
 */
function bruteForce(splits: Split[], target: number): number | null {
  const untrusted = (split: Split) => split.meters > 0 && split.seconds <= 0;
  let best: number | null = null;
  for (let from = 0; from < splits.length; from += 1) {
    if (untrusted(splits[from])) continue;
    let meters = 0;
    let seconds = 0;
    for (let to = from; to < splits.length; to += 1) {
      if (untrusted(splits[to])) break;
      meters += splits[to].meters;
      seconds += splits[to].seconds;
      if (meters < target || seconds <= 0) continue;
      const scaled = Math.round((seconds * target) / meters);
      if (best === null || scaled < best) best = scaled;
    }
  }
  return best;
}

/** Powtarzalny generator — przy niezgodności chcę móc odtworzyć dokładnie ten sam zestaw. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function randomSplits(next: () => number): Split[] {
  const count = 1 + Math.floor(next() * 12);
  return Array.from({ length: count }, () => {
    // Co kilka odcinków wypada przerwa: dystans zerowy, sam czas.
    const rest = next() < 0.25;
    return {
      meters: rest ? 0 : Math.round(next() * 2000),
      seconds: Math.round(next() * 600),
    };
  });
}

describe('bestEffort wobec przeglądu wszystkich okien', () => {
  it('daje ten sam wynik na tysiącu losowych zestawów', () => {
    const next = random(20261010);
    const mismatches: { splits: Split[]; target: number; mine: unknown; brute: unknown }[] = [];

    for (let round = 0; round < 1000; round += 1) {
      const splits = randomSplits(next);
      const target = [100, 400, 1000, 5000][Math.floor(next() * 4)];
      const mine = bestEffort(splits, target);
      const brute = bruteForce(splits, target);
      if ((mine?.seconds ?? null) !== brute) {
        mismatches.push({ splits, target, mine: mine?.seconds ?? null, brute });
      }
    }

    expect(mismatches.slice(0, 3)).toEqual([]);
  });

  it('zwracany czas należy do któregoś z prawdziwych okien', () => {
    const next = random(7);
    for (let round = 0; round < 300; round += 1) {
      const splits = randomSplits(next);
      const target = 1000;
      const mine = bestEffort(splits, target);
      if (mine === null) continue;

      // Czas rekordu musi dać się odtworzyć z sum jakiegoś spójnego kawałka listy.
      const windows: number[] = [];
      for (let from = 0; from < splits.length; from += 1) {
        let meters = 0;
        let seconds = 0;
        for (let to = from; to < splits.length; to += 1) {
          meters += splits[to].meters;
          seconds += splits[to].seconds;
          if (meters >= target && seconds > 0) windows.push(Math.round((seconds * target) / meters));
        }
      }
      expect(windows).toContain(mine.seconds);
    }
  });
});
