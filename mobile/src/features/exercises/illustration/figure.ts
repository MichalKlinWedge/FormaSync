/**
 * Rysunek poglądowy ćwiczenia — geometria.
 *
 * Pozę opisujemy bezwzględnymi kątami odcinków ciała, a nie współrzędnymi punktów: tak daje się
 * ją napisać z głowy („ramię 70° w górę, przedramię 100°”) i poprawić jeden staw bez przeliczania
 * całej reszty. Moduł jest czystą matematyką — nie wie nic o Reakcie ani o SVG, a zwraca listę
 * figur, którą rysuje i aplikacja, i arkusz kontrolny w przeglądarce (tools/illustrations).
 *
 * Układ współrzędnych: 170 × 126, podłoga na y = 112, oś Y rośnie w dół (jak w SVG).
 * Kąty w stopniach, mierzone od osi X przeciwnie do ruchu wskazówek zegara: 0° to w prawo,
 * 90° pionowo w górę, -90° pionowo w dół.
 */

export type Vec = { x: number; y: number };

export const Frame = { width: 170, height: 126, floor: 112 } as const;

/** Proporcje figury. Stojąc: biodro na y = 78, bark na 52, czubek głowy na 36. */
export const Bones = {
  torso: 26,
  neck: 5,
  head: 5.5,
  upperArm: 13,
  forearm: 12.5,
  thigh: 17,
  shin: 17,
  foot: 6.5,
} as const;

/** Kończyna: odcinek bliższy (ramię, udo) i dalszy (przedramię, podudzie). */
export type Limb = {
  upper: number;
  lower: number;
  /** Stopa; domyślnie prostopadle do podudzia, w stronę patrzenia. Dotyczy tylko nóg. */
  foot?: number;
};

export type Pose = {
  /** Biodro — punkt zaczepienia całej figury. */
  hip: Vec;
  /** Tułów: biodro → bark. */
  torso: number;
  /** Szyja i głowa; domyślnie przedłużenie tułowia. */
  neck?: number;
  /**
   * Widoczne kończyny. Jedna ręka to widok z boku (druga jest za tułowiem), dwie — widok
   * z przodu albo z tyłu. Od tego zależy też rysunek sprzętu: sztanga w jednej dłoni jest
   * widziana od czoła, czyli jako talerz, a w dwóch — jako gryf między dłońmi.
   */
  arms: Limb[];
  legs: Limb[];
  /** Kierunek patrzenia: 1 w prawo, -1 w lewo. Ustawia stopy. */
  facing?: 1 | -1;
};

export type Arm = { elbow: Vec; hand: Vec };
export type Leg = { knee: Vec; ankle: Vec; toe: Vec };

export type Skeleton = {
  hip: Vec;
  shoulder: Vec;
  /** Nasada głowy — tu kończy się linia szyi. */
  neck: Vec;
  head: Vec;
  arms: Arm[];
  legs: Leg[];
  bones: [Vec, Vec][];
};

export type Tone =
  | 'figure'
  | 'ghost'
  | 'gear'
  | 'ghostGear'
  | 'scene'
  | 'arrow'
  /** Obrys sylwetki — gruba kreska rysowana pod wypełnieniem. */
  | 'bodyInk'
  /** Wypełnienie sylwetki. */
  | 'bodyFill'
  /** Kończyna po drugiej stronie ciała — ciemniejsza, rysowana za tułowiem. */
  | 'bodyFar'
  /** Mięsień pracujący w tym ruchu. */
  | 'work';

export type Shape =
  | { shape: 'line'; from: Vec; to: Vec; tone: Tone; width?: number }
  | { shape: 'circle'; at: Vec; r: number; tone: Tone; filled?: boolean; width?: number }
  /** `bounds` to punkty skrajne ścieżki — tylko do kadrowania, nie do rysowania. */
  | { shape: 'path'; d: string; tone: Tone; bounds: Vec[] };

/**
 * Sprzęt w dłoniach. Rysowany osobno dla każdej fazy, bo jedzie razem z dłońmi.
 * `hand` zawęża linkę albo gumę do jednej ręki — bez tego brama ciągnęłaby obie dłonie
 * do obu krążków.
 */
export type Gear =
  | { gear: 'none' }
  | { gear: 'barbell' }
  | { gear: 'ezbar' }
  | { gear: 'dumbbells'; single?: boolean }
  | { gear: 'kettlebell' }
  | { gear: 'band'; anchor: Vec; hand?: number }
  /** Guma nad kolanami — jedyny sprzęt, który nie czepia się dłoni. */
  | { gear: 'kneeBand' }
  | { gear: 'cable'; pulley: Vec; hand?: number };

/** Otoczenie: nieruchome, rysowane raz dla całego rysunku. */
export type Prop =
  | { prop: 'floor' }
  | { prop: 'bench'; at: Vec; angle: number; length?: number }
  | { prop: 'bar'; at: Vec; width?: number }
  | { prop: 'dipBars'; at: Vec; width?: number }
  | { prop: 'box'; at: Vec; width: number; height: number }
  | { prop: 'tower'; x: number; top: number }
  | { prop: 'pad'; at: Vec; angle: number; length: number };

export type Arrow = 'auto' | 'none' | 'hand' | 'hip' | 'ankle' | 'head';

export type Illustration = {
  /** Faza wyjściowa i końcowa. Jedna faza oznacza ćwiczenie izometryczne — bez strzałki. */
  phases: Pose[];
  gear?: Gear | Gear[];
  props?: Prop[];
  /** Co śledzi strzałka ruchu; „auto” wybiera punkt, który przemieszcza się najbardziej. */
  arrow?: Arrow;
  /**
   * Strzałka wskazana wprost — dla ruchów, których nie widać w kątach kończyn: szrugsy,
   * wspięcia na palce, kierunek marszu.
   */
  hint?: { from: Vec; to: Vec };
  /**
   * Odstęp między fazami. Gdy rusza się całe ciało — przysiad, wykrok, martwy ciąg — figury
   * narysowane w tym samym miejscu zlewają się w plątaninę kresek; rozsunięte czytają się jak
   * dwie klatki tego samego ruchu.
   */
  spread?: number;
  /**
   * Części ciała, które w tym ruchu pracują — zapalają się kolorem. Nie jest to mapa mięśni,
   * tylko wskazanie, gdzie ma iść uwaga: przy podciąganiu plecy i ramiona, a nie nogi.
   */
  work?: BodyPart[];
};

const rad = (deg: number) => (deg * Math.PI) / 180;
const round = (n: number) => Math.round(n * 100) / 100;

export function polar(from: Vec, length: number, deg: number): Vec {
  return { x: from.x + length * Math.cos(rad(deg)), y: from.y - length * Math.sin(rad(deg)) };
}

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);
const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function buildSkeleton(pose: Pose): Skeleton {
  const facing = pose.facing ?? 1;
  const shoulder = polar(pose.hip, Bones.torso, pose.torso);
  const neckAngle = pose.neck ?? pose.torso;
  const neck = polar(shoulder, Bones.neck, neckAngle);
  const head = polar(shoulder, Bones.neck + Bones.head, neckAngle);

  const arms = pose.arms.map((arm) => {
    const elbow = polar(shoulder, Bones.upperArm, arm.upper);
    return { elbow, hand: polar(elbow, Bones.forearm, arm.lower) };
  });
  const legs = pose.legs.map((leg) => {
    const knee = polar(pose.hip, Bones.thigh, leg.upper);
    const ankle = polar(knee, Bones.shin, leg.lower);
    // Stopa odchodzi od podudzia pod kątem prostym, w stronę, w którą patrzy figura.
    return { knee, ankle, toe: polar(ankle, Bones.foot, leg.foot ?? leg.lower + 90 * facing) };
  });

  const bones: [Vec, Vec][] = [
    [pose.hip, shoulder],
    [shoulder, neck],
  ];
  for (const arm of arms) bones.push([shoulder, arm.elbow], [arm.elbow, arm.hand]);
  for (const leg of legs) bones.push([pose.hip, leg.knee], [leg.knee, leg.ankle], [leg.ankle, leg.toe]);

  return { hip: pose.hip, shoulder, neck, head, arms, legs, bones };
}

/**
 * Przesuwa całą pozę tak, żeby wskazany punkt wylądował w zadanym miejscu. Dla ćwiczeń,
 * w których dłonie albo stopy są przykute do sprzętu — drążek, poręcze, podłoga — a rusza się
 * resztę ciała: kąty dobiera się wtedy swobodnie, a dopiero `anchor` sadza figurę na miejscu.
 */
export function anchor(pose: Pose, point: 'hand' | 'ankle' | 'toe', target: Vec, index = 0): Pose {
  const skeleton = buildSkeleton(pose);
  const current =
    point === 'hand' ? skeleton.arms[index]?.hand : point === 'ankle' ? skeleton.legs[index]?.ankle : skeleton.legs[index]?.toe;
  if (!current) return pose;
  return { ...pose, hip: { x: pose.hip.x + (target.x - current.x), y: pose.hip.y + (target.y - current.y) } };
}

/**
 * Kąty kończyny, która ma sięgnąć z zaczepu do wskazanego punktu. Dla nóg stojących na podłodze
 * czy na podeście wygodniej podać, gdzie jest stopa, niż zgadywać dwa kąty naraz; `bend` wybiera
 * stronę, w którą wychodzi kolano.
 */
export function reach(from: Vec, to: Vec, bend: 1 | -1, foot?: number): Limb {
  const span = Math.min(Math.hypot(to.x - from.x, to.y - from.y), Bones.thigh + Bones.shin - 0.01) || 0.01;
  const direct = Math.atan2(from.y - to.y, to.x - from.x);
  const cosine = (Bones.thigh ** 2 + span ** 2 - Bones.shin ** 2) / (2 * Bones.thigh * span);
  const upper = direct + bend * Math.acos(Math.min(Math.max(cosine, -1), 1));
  const knee = { x: from.x + Bones.thigh * Math.cos(upper), y: from.y - Bones.thigh * Math.sin(upper) };
  const lower = Math.atan2(knee.y - to.y, to.x - knee.x);
  const degrees = 180 / Math.PI;
  return { upper: upper * degrees, lower: lower * degrees, foot };
}

/**
 * Grubość poszczególnych części ciała. Sylwetkę rysujemy grubymi kreskami z zaokrąglonymi
 * końcami, a nie wielokątami: kreski same się ze sobą zlewają w jedną bryłę, więc w miejscu
 * stawu nie ma szwu ani kanta, który trzeba by maskować.
 */
export const Girth = {
  torso: 10.5,
  neck: 4.6,
  upperArm: 5.2,
  forearm: 4.4,
  thigh: 6.8,
  shin: 5.2,
  foot: 3.4,
} as const;

export type BodyPart = keyof typeof Girth;

/** Kość razem z nazwą części ciała — stąd wiadomo, jak gruba jest i czy akurat pracuje. */
type Segment = { from: Vec; to: Vec; part: BodyPart };

const limbSegments = (skeleton: Skeleton): Segment[] => {
  const segments: Segment[] = [];
  for (const arm of skeleton.arms) {
    segments.push({ from: skeleton.shoulder, to: arm.elbow, part: 'upperArm' });
    segments.push({ from: arm.elbow, to: arm.hand, part: 'forearm' });
  }
  for (const leg of skeleton.legs) {
    segments.push({ from: skeleton.hip, to: leg.knee, part: 'thigh' });
    segments.push({ from: leg.knee, to: leg.ankle, part: 'shin' });
    segments.push({ from: leg.ankle, to: leg.toe, part: 'foot' });
  }
  return segments;
};

const trunkSegments = (skeleton: Skeleton): Segment[] => [
  { from: skeleton.hip, to: skeleton.shoulder, part: 'torso' },
  { from: skeleton.shoulder, to: skeleton.neck, part: 'neck' },
];

/**
 * Przesunięcie kończyny po drugiej stronie ciała. W widoku z boku pozy opisują jedną rękę
 * i jedną nogę — narysowana sama sylwetka wychodzi wtedy bryłą bez kończyn. Druga strona,
 * odsunięta o kilka jednostek w głąb i ciemniejsza, przywraca człowieka.
 */
const FAR: Vec = { x: -3.2, y: 1.4 };

const shifted = (segment: Segment): Segment => ({
  part: segment.part,
  from: { x: segment.from.x + FAR.x, y: segment.from.y + FAR.y },
  to: { x: segment.to.x + FAR.x, y: segment.to.y + FAR.y },
});

/** O tyle obrys jest grubszy od wypełnienia — na tę różnicę widać kreskę konturu. */
const INK = 1.8;

/**
 * Sylwetka z krwi i kości zamiast patyczaka. Rysujemy ją dwoma przebiegami: najpierw cały
 * obrys, potem całe wypełnienie. Odwrotna kolejność — część po części — zostawiałaby kreski
 * konturu w poprzek sąsiednich kończyn.
 */
export function bodyShapes(skeleton: Skeleton, work: BodyPart[] = []): Shape[] {
  const limbs = limbSegments(skeleton);
  // Jedna ręka albo jedna noga znaczy widok z boku: drugą stronę dorysowujemy za tułowiem.
  const sideView = skeleton.arms.length < 2 || skeleton.legs.length < 2;
  const far = sideView ? limbs.map(shifted) : [];

  const inkOf = (segments: Segment[]): Shape[] =>
    segments.map((segment) => ({
      shape: 'line',
      from: segment.from,
      to: segment.to,
      tone: 'bodyInk',
      width: Girth[segment.part] + INK,
    }));

  const fillOf = (segments: Segment[], tone: (part: BodyPart) => Tone): Shape[] =>
    segments.map((segment) => ({
      shape: 'line',
      from: segment.from,
      to: segment.to,
      tone: tone(segment.part),
      width: Girth[segment.part],
    }));

  const trunk = trunkSegments(skeleton);
  const near = (part: BodyPart): Tone => (work.includes(part) ? 'work' : 'bodyFill');

  return [
    // Kolejność to głębia: najpierw druga strona ciała, potem tułów, na końcu kończyny bliższe.
    ...inkOf(far),
    ...fillOf(far, () => 'bodyFar'),
    ...inkOf(trunk),
    ...fillOf(trunk, near),
    { shape: 'circle', at: skeleton.head, r: Bones.head + INK / 2, tone: 'bodyInk', filled: true },
    { shape: 'circle', at: skeleton.head, r: Bones.head, tone: 'bodyFill', filled: true },
    ...inkOf(limbs),
    ...fillOf(limbs, near),
  ];
}

function figureShapes(skeleton: Skeleton, tone: Tone): Shape[] {
  const shapes: Shape[] = skeleton.bones.map(([from, to]) => ({ shape: 'line', from, to, tone }));
  shapes.push({ shape: 'circle', at: skeleton.head, r: Bones.head, tone });
  return shapes;
}

/** Linia pofalowana — guma oporowa. */
function wavy(from: Vec, to: Vec, waves = 7, amplitude = 2.2): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dist(from, to) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  let d = `M ${round(from.x)} ${round(from.y)}`;
  for (let i = 1; i <= waves; i++) {
    const end = i / waves;
    const control = end - 1 / (2 * waves);
    const side = i % 2 ? 1 : -1;
    const cx = from.x + dx * control + nx * amplitude * 2 * side;
    const cy = from.y + dy * control + ny * amplitude * 2 * side;
    d += ` Q ${round(cx)} ${round(cy)} ${round(from.x + dx * end)} ${round(from.y + dy * end)}`;
  }
  return d;
}

const PLATE = 6.2;

function gearShapes(gear: Gear, skeleton: Skeleton, tone: Tone): Shape[] {
  const hands = skeleton.arms.map((arm) => arm.hand);
  if (hands.length === 0) return [];
  const shapes: Shape[] = [];
  const attached = (hand?: number) => (hand === undefined ? hands : [hands[hand]].filter(Boolean));

  switch (gear.gear) {
    case 'none':
      break;

    case 'barbell':
    case 'ezbar': {
      if (hands.length === 1) {
        // Widok z czoła: z gryfu widać tylko talerz.
        shapes.push({ shape: 'circle', at: hands[0], r: PLATE, tone });
        break;
      }
      const [a, b] = hands;
      const length = dist(a, b) || 1;
      const ux = (b.x - a.x) / length;
      const uy = (b.y - a.y) / length;
      const grow = 9;
      const left = { x: a.x - ux * grow, y: a.y - uy * grow };
      const right = { x: b.x + ux * grow, y: b.y + uy * grow };
      if (gear.gear === 'ezbar') {
        // Łamany gryf: dwa zgięcia między dłońmi, żeby odróżnić go od prostej sztangi.
        const nx = -uy;
        const ny = ux;
        const bend = 3.2;
        const p1 = { x: a.x + ux * length * 0.3 + nx * bend, y: a.y + uy * length * 0.3 + ny * bend };
        const p2 = { x: a.x + ux * length * 0.7 - nx * bend, y: a.y + uy * length * 0.7 - ny * bend };
        shapes.push({
          shape: 'path',
          d: `M ${round(left.x)} ${round(left.y)} L ${round(p1.x)} ${round(p1.y)} L ${round(p2.x)} ${round(p2.y)} L ${round(right.x)} ${round(right.y)}`,
          tone,
          bounds: [left, right],
        });
      } else {
        shapes.push({ shape: 'line', from: left, to: right, tone });
      }
      shapes.push({ shape: 'circle', at: left, r: 4.4, tone, filled: true });
      shapes.push({ shape: 'circle', at: right, r: 4.4, tone, filled: true });
      break;
    }

    case 'dumbbells': {
      // Hantel rysujemy prostopadle do przedramienia — czytelniej niż rzut zgodny z widokiem.
      // `single` to jeden hantel trzymany oburącz: rysujemy go między dłońmi.
      const grips = gear.single ? [{ at: mid(hands[0], hands[hands.length - 1]), along: skeleton.arms[0] }] : skeleton.arms.map((arm) => ({ at: arm.hand, along: arm }));
      for (const grip of grips) {
        const length = dist(grip.along.elbow, grip.along.hand) || 1;
        const nx = -(grip.along.hand.y - grip.along.elbow.y) / length;
        const ny = (grip.along.hand.x - grip.along.elbow.x) / length;
        const half = 5.2;
        const a = { x: grip.at.x - nx * half, y: grip.at.y - ny * half };
        const b = { x: grip.at.x + nx * half, y: grip.at.y + ny * half };
        shapes.push({ shape: 'line', from: a, to: b, tone });
        shapes.push({ shape: 'circle', at: a, r: 2.9, tone, filled: true });
        shapes.push({ shape: 'circle', at: b, r: 2.9, tone, filled: true });
      }
      break;
    }

    case 'kettlebell': {
      const grip = hands.length === 1 ? hands[0] : mid(hands[0], hands[1]);
      const ball = { x: grip.x, y: grip.y + 9.5 };
      shapes.push({ shape: 'line', from: { x: grip.x - 3.4, y: grip.y }, to: { x: ball.x - 3.4, y: ball.y - 4 }, tone });
      shapes.push({ shape: 'line', from: { x: grip.x + 3.4, y: grip.y }, to: { x: ball.x + 3.4, y: ball.y - 4 }, tone });
      shapes.push({ shape: 'circle', at: ball, r: 5.6, tone });
      break;
    }

    case 'kneeBand': {
      const [left, right] = skeleton.legs;
      if (left && right) shapes.push({ shape: 'path', d: wavy(left.knee, right.knee, 5), tone, bounds: [left.knee, right.knee] });
      break;
    }

    case 'band':
      for (const hand of attached(gear.hand))
        shapes.push({ shape: 'path', d: wavy(gear.anchor, hand), tone, bounds: [gear.anchor, hand] });
      break;

    case 'cable':
      for (const hand of attached(gear.hand)) shapes.push({ shape: 'line', from: gear.pulley, to: hand, tone });
      shapes.push({ shape: 'circle', at: gear.pulley, r: 3, tone });
      break;
  }

  return shapes;
}

function propShapes(prop: Prop): Shape[] {
  const tone: Tone = 'scene';
  switch (prop.prop) {
    case 'floor':
      return [{ shape: 'line', from: { x: 4, y: Frame.floor }, to: { x: Frame.width - 4, y: Frame.floor }, tone }];

    case 'bench': {
      const length = prop.length ?? 56;
      const far = polar(prop.at, length, prop.angle);
      const leg = (t: number): Shape => {
        const foot = polar(prop.at, length * t, prop.angle);
        return { shape: 'line', from: foot, to: { x: foot.x, y: Frame.floor }, tone };
      };
      return [{ shape: 'line', from: prop.at, to: far, tone }, leg(0.12), leg(0.88)];
    }

    case 'bar': {
      // Sam drążek z zagięciami na końcach; słupki do podłogi zamykały figurę w ramce drzwi.
      const half = (prop.width ?? 56) / 2;
      const left = { x: prop.at.x - half, y: prop.at.y };
      const right = { x: prop.at.x + half, y: prop.at.y };
      return [
        { shape: 'line', from: left, to: right, tone },
        { shape: 'line', from: left, to: { x: left.x, y: left.y - 8 }, tone },
        { shape: 'line', from: right, to: { x: right.x, y: right.y - 8 }, tone },
      ];
    }

    case 'dipBars': {
      const half = (prop.width ?? 40) / 2;
      const left = { x: prop.at.x - half, y: prop.at.y };
      const right = { x: prop.at.x + half, y: prop.at.y };
      return [
        { shape: 'line', from: left, to: right, tone },
        { shape: 'line', from: { x: left.x + 4, y: left.y }, to: { x: left.x + 4, y: Frame.floor }, tone },
        { shape: 'line', from: { x: right.x - 4, y: right.y }, to: { x: right.x - 4, y: Frame.floor }, tone },
      ];
    }

    case 'box': {
      const { at, width, height } = prop;
      const d = `M ${round(at.x)} ${round(at.y)} h ${round(width)} v ${round(height)} h ${round(-width)} Z`;
      return [{ shape: 'path', d, tone, bounds: [at, { x: at.x + width, y: at.y + height }] }];
    }

    case 'tower':
      return [
        { shape: 'line', from: { x: prop.x, y: prop.top }, to: { x: prop.x, y: Frame.floor }, tone },
        { shape: 'line', from: { x: prop.x - 6, y: Frame.floor - 2 }, to: { x: prop.x + 6, y: Frame.floor - 2 }, tone },
      ];

    case 'pad':
      return [{ shape: 'line', from: prop.at, to: polar(prop.at, prop.length, prop.angle), tone }];
  }
}

function tracked(skeleton: Skeleton, which: Exclude<Arrow, 'auto' | 'none'>): Vec | null {
  switch (which) {
    case 'hand':
      return skeleton.arms[0]?.hand ?? null;
    case 'hip':
      return skeleton.hip;
    case 'ankle':
      return skeleton.legs[0]?.ankle ?? null;
    case 'head':
      return skeleton.head;
  }
}

function arrow(start: Vec, end: Vec, sideways = true): Shape[] {
  const span = dist(start, end);
  if (span < 5) return [];

  // Strzałka biegnie obok toru ruchu, nie po nim — inaczej ginie w kończynach.
  const nx = -(end.y - start.y) / span;
  const ny = (end.x - start.x) / span;
  const offset = sideways ? 7 : 0;
  const tail = { x: start.x + nx * offset, y: start.y + ny * offset };
  const tip = { x: end.x + nx * offset, y: end.y + ny * offset };
  const control = { x: (tail.x + tip.x) / 2 + nx * span * 0.12, y: (tail.y + tip.y) / 2 + ny * span * 0.12 };

  const angle = Math.atan2(control.y - tip.y, control.x - tip.x);
  const barb = (spread: number): Shape => ({
    shape: 'line',
    from: tip,
    to: { x: tip.x + Math.cos(angle + spread) * 6, y: tip.y + Math.sin(angle + spread) * 6 },
    tone: 'arrow',
  });

  return [
    {
      shape: 'path',
      d: `M ${round(tail.x)} ${round(tail.y)} Q ${round(control.x)} ${round(control.y)} ${round(tip.x)} ${round(tip.y)}`,
      tone: 'arrow',
      bounds: [tail, tip],
    },
    barb(0.42),
    barb(-0.42),
  ];
}

function motionArrow(from: Skeleton, to: Skeleton, which: Arrow = 'auto'): Shape[] {
  if (which === 'none') return [];

  let start: Vec | null = null;
  let end: Vec | null = null;
  if (which === 'auto') {
    // Strzałka pokazuje to, co naprawdę jedzie: wybieramy punkt o największym przemieszczeniu.
    let best = 0;
    for (const candidate of ['hand', 'ankle', 'hip', 'head'] as const) {
      const a = tracked(from, candidate);
      const b = tracked(to, candidate);
      if (!a || !b) continue;
      const moved = dist(a, b);
      if (moved > best) {
        best = moved;
        start = a;
        end = b;
      }
    }
  } else {
    start = tracked(from, which);
    end = tracked(to, which);
  }

  if (!start || !end || dist(start, end) < 7) return [];
  return arrow(start, end);
}

/** Rysunek gotowy do narysowania: figury i kadr dobrany do ich zasięgu. */
export type Drawing = { shapes: Shape[]; viewBox: string };

const MARGIN = 8;
/** Najmniejszy kadr — bez tego pompka czy deska rozdęłyby się na całą kartę. */
const MIN_WIDTH = 118;

/**
 * Kadr liczony z zawartości, a nie stały. Ćwiczenia na podłodze zajmują dolną jedną trzecią
 * układu współrzędnych, a stojące całą wysokość; wspólna ramka zostawiałaby jednym pustkę nad
 * głową, a drugim ciasnotę.
 */
function frameFor(shapes: Shape[]): string {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (point: Vec, radius = 0) => {
    minX = Math.min(minX, point.x - radius);
    minY = Math.min(minY, point.y - radius);
    maxX = Math.max(maxX, point.x + radius);
    maxY = Math.max(maxY, point.y + radius);
  };

  for (const shape of shapes) {
    if (shape.shape === 'line') {
      include(shape.from);
      include(shape.to);
    } else if (shape.shape === 'circle') {
      include(shape.at, shape.r);
    } else {
      for (const point of shape.bounds) include(point);
    }
  }
  if (!Number.isFinite(minX)) return `0 0 ${Frame.width} ${Frame.height}`;

  const aspect = Frame.width / Frame.height;
  let width = Math.max(maxX - minX + 2 * MARGIN, MIN_WIDTH);
  let height = Math.max(maxY - minY + 2 * MARGIN, MIN_WIDTH / aspect);
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return `${round(centerX - width / 2)} ${round(centerY - height / 2)} ${round(width)} ${round(height)}`;
}

/** Składa cały rysunek: otoczenie, faza wyjściowa cieniem, faza końcowa i strzałka ruchu. */
/** Jedna faza ruchu: własny rysunek i podpis, co się na nim dzieje. */
export type Panel = { shapes: Shape[]; caption: string };

const CAPTIONS = ['Pozycja startowa', 'Pozycja końcowa'];

/**
 * Rozkłada ćwiczenie na osobne, podpisane fazy — zamiast nakładać je na siebie w jednym kadrze.
 * Dwa rysunki obok siebie mówią wprost, od czego się zaczyna i czym kończy, a cieniem rysowana
 * poza wyjściowa zawsze wymagała domyślania się.
 *
 * Kadr jest jeden dla wszystkich faz: liczony ze wszystkich figur naraz, żeby sylwetka nie
 * zmieniała rozmiaru między obrazkami i dało się je czytać jako jeden ruch.
 */
export function buildPanels(illustration: Illustration): { panels: Panel[]; viewBox: string } {
  const gear: Gear[] = illustration.gear ? [illustration.gear].flat() : [];
  const props: Prop[] = illustration.props ?? [{ prop: 'floor' }];
  const work = illustration.work ?? [];
  const skeletons = illustration.phases.map(buildSkeleton);
  const scenery = props.flatMap(propShapes);

  const panels: Panel[] = skeletons.map((skeleton, index) => ({
    caption: skeletons.length === 1 ? 'Pozycja do utrzymania' : (CAPTIONS[index] ?? `Faza ${index + 1}`),
    shapes: [
      ...scenery,
      ...bodyShapes(skeleton, work),
      ...gear.flatMap((g) => gearShapes(g, skeleton, 'gear')),
    ],
  }));

  // Strzałka kierunku powtarza się na obu fazach — na pierwszej mówi „tędy”, na drugiej „stąd”.
  if (skeletons.length > 1) {
    const move = illustration.hint
      ? arrow(illustration.hint.from, illustration.hint.to, false)
      : motionArrow(skeletons[0], skeletons[skeletons.length - 1], illustration.arrow);
    for (const panel of panels) panel.shapes.push(...move);
  } else if (illustration.hint) {
    panels[0].shapes.push(...arrow(illustration.hint.from, illustration.hint.to, false));
  }

  const viewBox = frameFor(panels.flatMap((panel) => panel.shapes));
  return { panels, viewBox };
}

export function buildIllustration(illustration: Illustration): Drawing {
  const gear: Gear[] = illustration.gear ? [illustration.gear].flat() : [];
  const props: Prop[] = illustration.props ?? [{ prop: 'floor' }];
  const spread = illustration.spread ?? 0;
  const count = illustration.phases.length;
  const skeletons = illustration.phases.map((pose, index) =>
    buildSkeleton(spread ? { ...pose, hip: { x: pose.hip.x - spread * (count - 1 - index), y: pose.hip.y } } : pose),
  );
  const last = skeletons[skeletons.length - 1];

  const shapes: Shape[] = props.flatMap(propShapes);
  for (const skeleton of skeletons.slice(0, -1)) {
    shapes.push(...figureShapes(skeleton, 'ghost'), ...gear.flatMap((g) => gearShapes(g, skeleton, 'ghostGear')));
  }
  shapes.push(...figureShapes(last, 'figure'), ...gear.flatMap((g) => gearShapes(g, last, 'gear')));
  if (illustration.hint) {
    shapes.push(...arrow(illustration.hint.from, illustration.hint.to, false));
  } else if (count > 1) {
    // Przy rozsuniętych fazach strzałka biegnie po torze ruchu nałożonym na figurę końcową,
    // a nie przez pustkę między nimi.
    const path = spread ? illustration.phases.map(buildSkeleton) : skeletons;
    shapes.push(...motionArrow(path[0], path[path.length - 1], illustration.arrow));
  }
  return { shapes, viewBox: frameFor(shapes) };
}
