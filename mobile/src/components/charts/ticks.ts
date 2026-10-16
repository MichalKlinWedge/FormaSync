/**
 * Wartości na linie pomocnicze wykresu.
 *
 * Linia w połowie zakresu wypada na „73,4 kg” i nie mówi nic — oko szuka okrągłej liczby, bo
 * tylko od niej umie odmierzyć resztę. Dlatego linie stawiamy na wielokrotnościach kroku, który
 * człowiek liczy w pamięci: 1, 2, 2,5, 5 i ich dziesiętne wielokrotności.
 *
 * Liczba linii jest życzeniem, nie obietnicą: krok musi zostać okrągły, więc bierzemy ten, który
 * daje najbliżej tylu linii, ile poproszono. Przy równej odległości wygrywa krok większy — mniej
 * linii czyta się lepiej niż gęstwina.
 */

/** Mnożniki kroku, które da się policzyć w pamięci. */
const STEPS = [1, 2, 2.5, 5, 10];

/** Bez tego 0,1 + 0,2 zostawia ogon, który wychodzi na opisie osi. */
const trim = (value: number): number => Number(value.toFixed(10));

function ticksFor(low: number, high: number, step: number): number[] {
  const first = Math.ceil(low / step) * step;
  const ticks: number[] = [];
  // Zapas na błąd zmiennoprzecinkowy: bez niego ostatnia linia potrafi zniknąć.
  for (let value = first; value <= high + step * 1e-9; value += step) ticks.push(trim(value));
  return ticks;
}

export function niceTicks(low: number, high: number, count: number): number[] {
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low || count < 2) return [];

  const magnitude = 10 ** Math.floor(Math.log10((high - low) / count));
  let best: { ticks: number[]; distance: number; step: number } | null = null;

  for (const multiplier of STEPS) {
    const step = multiplier * magnitude;
    const ticks = ticksFor(low, high, step);
    if (ticks.length < 2) continue;

    const distance = Math.abs(ticks.length - count);
    if (best === null || distance < best.distance || (distance === best.distance && step > best.step)) {
      best = { ticks, distance, step };
    }
  }

  return best?.ticks ?? [];
}
