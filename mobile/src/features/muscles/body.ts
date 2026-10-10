/**
 * Sylwetka do mapy partii mięśniowych — przód i tył, jak na zegarku.
 *
 * Geometria jest danymi, nie rysunkiem: kontur i każdy mięsień to lista punktów albo elipsa,
 * opisana wyłącznie dla prawej połowy ciała i odbijana na lewą. Dzięki temu figura jest
 * symetryczna z definicji, a poprawka kształtu to zmiana kilku liczb, nie przerysowywanie
 * ścieżki SVG. Wszystko tu jest czyste — da się obejrzeć i przetestować bez urządzenia.
 */

/** Kadr jednej figury. Punkty opisujemy w tej skali, oś symetrii biegnie przez środek. */
export const Figure = { width: 100, height: 212 } as const;

const AXIS = Figure.width / 2;

export type Point = [number, number];

export type Shape =
  | { kind: 'poly'; points: Point[] }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotate?: number };

/** Partia mięśniowa narysowana na figurze. `category` to nazwa z katalogu ćwiczeń. */
export type Region = { category: string; shapes: Shape[] };

export type Side = 'FRONT' | 'BACK';

const mirrorPoint = ([x, y]: Point): Point => [Figure.width - x, y];

const mirrorShape = (shape: Shape): Shape =>
  shape.kind === 'poly'
    ? { kind: 'poly', points: shape.points.map(mirrorPoint) }
    : { ...shape, cx: Figure.width - shape.cx, rotate: shape.rotate === undefined ? undefined : -shape.rotate };

/**
 * Mięsień podany raz, narysowany po obu stronach. Kształty leżące na osi (brzuch, prostowniki)
 * i tak się nakładają, więc odbicie ich nie psuje — a reszta nie wymaga drugiego opisu.
 */
const paired = (category: string, shapes: Shape[]): Region => ({
  category,
  shapes: [...shapes, ...shapes.map(mirrorShape)],
});

const ellipse = (cx: number, cy: number, rx: number, ry: number, rotate?: number): Shape => ({
  kind: 'ellipse',
  cx,
  cy,
  rx,
  ry,
  rotate,
});

const poly = (points: Point[]): Shape => ({ kind: 'poly', points });

/**
 * Kontur prawej połowy, od czubka głowy w dół: głowa, bark, ramię z zewnątrz, dłoń, ramię od
 * środka, bok tułowia, noga z zewnątrz, stopa i noga od środka aż do krocza. Lewą połowę
 * dokłada odbicie, więc tu opisujemy tylko jedną stronę.
 */
const OUTLINE: Point[] = [
  [50, 3],
  [56.5, 6],
  [59, 14],
  [56.5, 22],
  [53.5, 26],
  [54, 30],
  [62, 34],
  [70, 39],
  [74.5, 46],
  [76, 56],
  [75.5, 68],
  [77, 80],
  [76, 92],
  [73, 99],
  [69, 95],
  [68.5, 84],
  [67, 70],
  [65.5, 56],
  [63, 46],
  [61, 56],
  [58, 70],
  [57, 82],
  [59.5, 92],
  [63, 100],
  [65.5, 112],
  [65, 126],
  [62.5, 142],
  [61, 152],
  [63.5, 163],
  [60, 180],
  [58.5, 192],
  [62, 200],
  [53.5, 201],
  [53, 192],
  [53.5, 170],
  [52.5, 150],
  [51.5, 130],
  [50, 114],
];

/** Zamknięty obrys całej figury: prawa połowa, a potem lewa wracająca do góry. */
export const outline: Point[] = [
  ...OUTLINE,
  ...OUTLINE.slice(1, -1).reverse().map(mirrorPoint),
];

/** Mięśnie widoczne od przodu. */
export const frontRegions: Region[] = [
  paired('Barki', [ellipse(68, 44, 7.5, 7, -25)]),
  paired('Klatka piersiowa', [poly([[51, 40], [62, 43], [64, 50], [61, 57], [51, 57]])]),
  paired('Brzuch i core', [poly([[51, 59], [59, 59], [58, 74], [56.5, 88], [51, 92]])]),
  paired('Biceps', [ellipse(71, 62, 4.4, 10)]),
  paired('Przedramiona', [ellipse(72.5, 85, 3.8, 11)]),
  paired('Czworogłowe uda', [ellipse(59, 126, 6.2, 24)]),
  paired('Przywodziciele', [ellipse(53.5, 122, 3, 15)]),
];

/** Mięśnie widoczne od tyłu. */
export const backRegions: Region[] = [
  paired('Barki', [ellipse(68, 44, 7.5, 7, -25)]),
  paired('Plecy', [
    poly([[51, 33], [62, 40], [61, 48], [51, 50]]),
    poly([[51, 50], [62, 49], [63, 64], [51, 72]]),
    poly([[51, 72], [56, 71], [55, 88], [51, 90]]),
  ]),
  paired('Triceps', [ellipse(71, 62, 4.4, 10)]),
  paired('Przedramiona', [ellipse(72.5, 85, 3.8, 11)]),
  paired('Pośladki', [ellipse(57, 101, 7, 9)]),
  paired('Dwugłowe uda', [ellipse(59, 128, 6, 21)]),
  paired('Łydki', [ellipse(58.5, 168, 5.2, 14)]),
];

export const regionsOf = (side: Side): Region[] => (side === 'FRONT' ? frontRegions : backRegions);

/** Partie, które figura w ogóle umie pokazać — po jednej stronie albo po obu. */
export const drawnCategories = (): Set<string> =>
  new Set([...frontRegions, ...backRegions].map((region) => region.category));

/**
 * Wygładzona ścieżka przez podane punkty (Catmull–Rom zamieniony na krzywe Béziera).
 * Łamana z tych samych punktów wyglądałaby jak wycinanka — ciało nie ma kantów.
 */
export function smoothPath(points: Point[], closed = true): string {
  if (points.length < 3) return '';
  const at = (index: number): Point => {
    const last = points.length - 1;
    if (closed) return points[(index + points.length) % points.length];
    return points[Math.min(Math.max(index, 0), last)];
  };

  const parts = [`M ${fmt(points[0][0])} ${fmt(points[0][1])}`];
  const end = closed ? points.length : points.length - 1;
  for (let i = 0; i < end; i += 1) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    // Współczynnik 6 to standardowe przełożenie Catmull–Rom na Béziera.
    parts.push(
      `C ${fmt(x1 + (x2 - x0) / 6)} ${fmt(y1 + (y2 - y0) / 6)}, ` +
        `${fmt(x2 - (x3 - x1) / 6)} ${fmt(y2 - (y3 - y1) / 6)}, ${fmt(x2)} ${fmt(y2)}`,
    );
  }
  if (closed) parts.push('Z');
  return parts.join(' ');
}

const fmt = (value: number): string => String(Math.round(value * 100) / 100);

export { AXIS };
