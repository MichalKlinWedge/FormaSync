/**
 * Pozy do rysunków poglądowych — po jednym wpisie na każde ćwiczenie z katalogu.
 *
 * Każdy rysunek to dwie fazy: wyjściowa (cieniem) i końcowa, plus strzałka ruchu. Ćwiczenia
 * izometryczne mają jedną fazę. Większość pozycji powstaje z kilkunastu wzorców niżej, bo
 * wyciskanie sztangi różni się od wyciskania hantli sprzętem, a nie sylwetką — wspólny wzorzec
 * trzyma je w jednym stylu i jest jedynym miejscem, w którym poprawia się taki ruch.
 *
 * Figura leżąca ma głowę po prawej, a nogi po lewej; stojąca patrzy w prawo. Klucz to nazwa
 * ćwiczenia z seed-data.ts — tam nazwa jest tożsamością rekordu (seed dogrywa brakujące po
 * nazwie), a test pilnuje, żeby każde ćwiczenie z katalogu miało tu swój wpis.
 */
import { anchor, Bones, Frame, reach, type Gear, type Illustration, type Limb, polar, type Pose, type Prop, type Vec } from './figure';

const FLOOR = Frame.floor;
const STAND: Vec = { x: 86, y: 78 };
/** Oś ciała figury leżącej na podłodze. */
const LYING = FLOOR - 4;

/** Podudzie dobrane tak, żeby stopa stanęła na podłodze — bez ręcznego liczenia kąta. */
function legToFloor(hip: Vec, thigh: number, foot = 0): Limb {
  const knee = polar(hip, Bones.thigh, thigh);
  const reach = Math.min(Math.max((knee.y - FLOOR) / Bones.shin, -1), 1);
  return { upper: thigh, lower: (Math.asin(reach) * 180) / Math.PI, foot };
}

/** Odbicie lewo–prawo — druga kończyna w widoku z przodu. */
const flip = (limb: Limb): Limb => ({
  upper: 180 - limb.upper,
  lower: 180 - limb.lower,
  foot: limb.foot === undefined ? undefined : 180 - limb.foot,
});

const both = (limb: Limb): Limb[] => [limb, flip(limb)];

/** Nogi w lekkim rozkroku, widok z przodu. */
const stance = (hip: Vec, spread = 7): Limb[] => [legToFloor(hip, -90 + spread), legToFloor(hip, -90 - spread, 180)];

/** Stopy w jednym miejscu w obu fazach — inaczej figura jeździłaby po podłodze. */
const planted = (pose: Pose, x = 86): Pose => anchor(pose, 'ankle', { x, y: FLOOR });

const front = (arms: Limb, hip: Vec = STAND): Pose => ({ hip, torso: 90, arms: both(arms), legs: stance(hip) });

/** Ręce opuszczone, widok z przodu — na tyle szeroko, żeby dwa hantle się nie zlały. */
const HANGING: Limb = { upper: -70, lower: -78 };

const side = (arms: Limb, hip: Vec = STAND, torso = 90): Pose => ({
  hip,
  torso,
  arms: [arms],
  legs: [legToFloor(hip, -90)],
});

/** Półprzysiad — biodro na tyle nisko, żeby kolana były wyraźnie ugięte. */
const HALF_SQUAT: Vec = { x: 86, y: 88 };

const FLAT_BENCH: Prop = { prop: 'bench', at: { x: 46, y: 86 }, angle: 0, length: 62 };
const SEAT: Prop = { prop: 'bench', at: { x: 64, y: 92 }, angle: 0, length: 40 };

// ——— wzorce ———

/** Wyciskanie na ławce: płasko (0°) albo skośnie (ok. 26°). */
function benchPress(incline: number, gear: Gear): Illustration {
  const pad = { x: 46 - incline * 0.25, y: 86 + incline * 0.33 };
  const hip = polar(polar(pad, 18, incline), 4, incline + 90);
  const legs = [legToFloor(hip, incline < 10 ? -125 : -48)];
  const low: Pose = { hip, torso: incline, arms: [{ upper: 160 + incline, lower: 15 + incline }], legs };
  const high: Pose = { ...low, arms: [{ upper: 85 + incline, lower: 92 + incline }] };
  return {
    phases: [low, high],
    gear,
    props: [{ prop: 'floor' }, { prop: 'bench', at: pad, angle: incline, length: 62 }],
  };
}

/** Wyciskanie francuskie leżąc: łokcie w miejscu, przedramiona znad czoła w górę. */
function lyingExtension(gear: Gear): Illustration {
  const hip = { x: 66, y: 82 };
  const legs = [legToFloor(hip, -125)];
  const bent: Pose = { hip, torso: 0, arms: [{ upper: 80, lower: 172 }], legs };
  return { phases: [bent, { ...bent, arms: [{ upper: 85, lower: 92 }] }], gear, props: [{ prop: 'floor' }, FLAT_BENCH] };
}

/** Uginanie ramion stojąc, widok z przodu. */
function curl(gear: Gear): Illustration {
  return { phases: [front(HANGING), front({ upper: -78, lower: 38 })], gear };
}

/** Wyciskanie nad głowę, widok z przodu. */
function overheadPress(gear: Gear, seated = false): Illustration {
  const rack: Limb = { upper: -35, lower: 85 };
  const top: Limb = { upper: 60, lower: 78 };
  if (!seated) return { phases: [front(rack), front(top)], gear };

  const hip = { x: 86, y: 88 };
  const legs = [legToFloor(hip, -48), legToFloor(hip, -62, 180)];
  const base: Pose = { hip, torso: 90, arms: both(rack), legs };
  return { phases: [base, { ...base, arms: both(top) }], gear, props: [{ prop: 'floor' }, SEAT] };
}

/** Zawias w biodrze: martwy ciąg, rumuński, dobry ranek. */
function hinge(gear: Gear, options: { torso: number; hip: Vec; knee: number; arms?: Limb }): Illustration {
  const arms = options.arms ?? { upper: -90, lower: -90 };
  const bottom: Pose = { hip: options.hip, torso: options.torso, arms: [arms], legs: [legToFloor(options.hip, options.knee)] };
  const top: Pose = { hip: STAND, torso: 90, arms: [arms], legs: [legToFloor(STAND, -90)] };
  return { phases: [planted(bottom), planted(top)], gear, arrow: 'hand', spread: 40 };
}

/** Przysiad w widoku z boku; `depth` to wysokość biodra w dolnej pozycji. */
function squat(gear: Gear, options: { arms: Limb; depth?: number; torso?: number }): Illustration {
  const { arms, depth = 98, torso = 64 } = options;
  const foot: Vec = { x: 86, y: FLOOR };
  const bottomHip = { x: 78, y: depth };
  const bottom: Pose = { hip: bottomHip, torso, arms: [arms], legs: [reach(bottomHip, foot, 1, 0)] };
  const top: Pose = { hip: STAND, torso: 88, arms: [arms], legs: [reach(STAND, foot, 1, 0)] };
  return { phases: [bottom, top], gear, arrow: 'hip', spread: 42 };
}

/** Wiosłowanie w opadzie: tułów blisko poziomu, ciężar z dołu do brzucha. */
function bentRow(gear: Gear): Illustration {
  const hip = { x: 74, y: 82 };
  const legs = [legToFloor(hip, -70)];
  const hanging: Pose = { hip, torso: 25, arms: [{ upper: -90, lower: -90 }], legs };
  return { phases: [hanging, { ...hanging, arms: [{ upper: -160, lower: -95 }] }], gear, arrow: 'hand' };
}

/** Podciąganie na drążku; łokcie do tyłu (nachwyt) albo przed siebie (podchwyt). */
function pullup(elbowBack: boolean): Illustration {
  const bar: Vec = { x: 88, y: 28 };
  const legs: Limb[] = [{ upper: -98, lower: -44, foot: 16 }];
  const hang: Pose = { hip: { x: 88, y: 80 }, torso: 90, arms: [{ upper: 90, lower: 90 }], legs };
  const top: Pose = { ...hang, arms: [elbowBack ? { upper: 150, lower: 30 } : { upper: 30, lower: 150 }] };
  return {
    phases: [anchor(hang, 'hand', bar), anchor(top, 'hand', bar)],
    props: [{ prop: 'floor' }, { prop: 'bar', at: bar, width: 52 }],
    arrow: 'hip',
  };
}

/** Ściąganie albo przyciąganie na wyciągu, siedząc. */
function seatedPull(gear: Gear, from: Limb, to: Limb, tower: Prop): Illustration {
  const hip = { x: 84, y: 88 };
  const legs = [legToFloor(hip, -42)];
  const base: Pose = { hip, torso: 94, arms: [from], legs };
  return {
    phases: [base, { ...base, arms: [to] }],
    gear,
    props: [{ prop: 'floor' }, SEAT, tower],
    arrow: 'hand',
  };
}

/** Wykrok i przysiad bułgarski: stopy stoją w miejscu, zmienia się tylko wysokość bioder. */
function lunge(gear: Gear, rearBox = false): Illustration {
  const arms: Limb = { upper: -88, lower: -90 };
  const frontFoot: Vec = { x: 98, y: FLOOR };
  const rearFoot: Vec = rearBox ? { x: 60, y: 96 } : { x: 66, y: 104 };
  const stand = (y: number, torso: number): Pose => {
    const hip = { x: 84, y };
    return { hip, torso, arms: [arms], legs: [reach(hip, frontFoot, -1), reach(hip, rearFoot, -1, -50)] };
  };
  const props: Prop[] = [{ prop: 'floor' }];
  if (rearBox) props.push({ prop: 'box', at: { x: 48, y: 96 }, width: 26, height: 16 });
  return { phases: [stand(81, 88), stand(93, 84)], gear, props, arrow: 'hip', spread: 46 };
}

/** Wspięcia na palce: przodostopie na podeście, pięta raz pod nim, raz wysoko. */
function calfRaise(gear: Gear): Illustration {
  const arms: Limb = { upper: -88, lower: -90 };
  const stand = (y: number, foot: number): Pose => ({
    hip: { x: 86, y },
    torso: 90,
    arms: [arms],
    legs: [{ upper: -90, lower: -90, foot }],
  });
  return {
    phases: [stand(65, -50)],
    gear,
    props: [{ prop: 'floor' }, { prop: 'box', at: { x: 84, y: 104 }, width: 22, height: 8 }],
    hint: { from: { x: 78, y: 107 }, to: { x: 78, y: 95 } },
  };
}

/** Pozycja na plecach: głowa po prawej, nogi po lewej. */
function supine(torso: number, arms: Limb[], legs: Limb[], hipX = 76, hipY = LYING): Pose {
  return { hip: { x: hipX, y: hipY }, torso, arms, legs };
}

/** Nogi ugięte, stopy na podłodze — brzuszki, mostek. */
const kneesUp: Limb = { upper: 150, lower: 210, foot: 180 };

// ——— katalog ———

export const exerciseIllustrations: Record<string, Illustration> = {
  // Klatka piersiowa
  'Wyciskanie sztangi na ławce płaskiej': benchPress(0, { gear: 'barbell' }),
  'Wyciskanie hantli na ławce skośnej': benchPress(26, { gear: 'dumbbells' }),
  // Ten sam łuk co na bramie; leżenie na ławce zostaje w opisie, bo z boku rozpiętki byłyby
  // nie do odróżnienia od wyciskania, a rzut z góry czytał się jak owad.
  'Rozpiętki z hantlami': {
    phases: [front({ upper: 8, lower: 2 }), front({ upper: -50, lower: -150 })],
    gear: { gear: 'dumbbells' },
  },
  Pompki: {
    phases: [
      anchor(
        { hip: { x: 78, y: 97 }, torso: 24, arms: [{ upper: -76, lower: -76 }], legs: [{ upper: 204, lower: 204, foot: -8 }] },
        'toe',
        { x: 48, y: FLOOR },
      ),
      anchor(
        { hip: { x: 78, y: 101 }, torso: 18, arms: [{ upper: -32, lower: -108 }], legs: [{ upper: 198, lower: 198, foot: -8 }] },
        'toe',
        { x: 48, y: FLOOR },
      ),
    ],
    arrow: 'head',
  },
  'Pompki na poręczach': {
    phases: [
      anchor(
        { hip: { x: 84, y: 88 }, torso: 82, arms: [{ upper: -88, lower: -92 }], legs: [{ upper: -100, lower: -170, foot: -80 }] },
        'hand',
        { x: 86, y: 86 },
      ),
      anchor(
        { hip: { x: 84, y: 88 }, torso: 82, arms: [{ upper: -24, lower: -112 }], legs: [{ upper: -100, lower: -170, foot: -80 }] },
        'hand',
        { x: 86, y: 86 },
      ),
    ],
    props: [{ prop: 'floor' }, { prop: 'dipBars', at: { x: 86, y: 86 }, width: 44 }],
    arrow: 'hip',
  },
  'Rozpiętki na wyciągu (brama)': {
    phases: [front({ upper: 8, lower: 2 }), front({ upper: -50, lower: -150 })],
    gear: [
      { gear: 'cable', pulley: { x: 18, y: 36 }, hand: 1 },
      { gear: 'cable', pulley: { x: 154, y: 36 }, hand: 0 },
    ],
    props: [{ prop: 'floor' }, { prop: 'tower', x: 18, top: 34 }, { prop: 'tower', x: 154, top: 34 }],
  },
  'Wyciskanie hantli na ławce płaskiej': benchPress(0, { gear: 'dumbbells' }),
  'Przenoszenie hantla nad głowę leżąc': {
    phases: [
      { hip: { x: 66, y: 82 }, torso: 0, arms: [{ upper: 85, lower: 92 }], legs: [legToFloor({ x: 66, y: 82 }, -125)] },
      { hip: { x: 66, y: 82 }, torso: 0, arms: [{ upper: 32, lower: 20 }], legs: [legToFloor({ x: 66, y: 82 }, -125)] },
    ],
    gear: { gear: 'dumbbells', single: true },
    props: [{ prop: 'floor' }, FLAT_BENCH],
  },

  // Plecy
  'Martwy ciąg': hinge({ gear: 'barbell' }, { torso: 34, hip: { x: 74, y: 92 }, knee: -22 }),
  'Wiosłowanie sztangą w opadzie': bentRow({ gear: 'barbell' }),
  'Wiosłowanie hantlem jednorącz': {
    phases: [
      {
        hip: { x: 72, y: 80 },
        torso: 18,
        arms: [
          { upper: -90, lower: -90 },
          { upper: -40, lower: -60 },
        ],
        legs: [legToFloor({ x: 72, y: 80 }, -74)],
      },
      {
        hip: { x: 72, y: 80 },
        torso: 18,
        arms: [
          { upper: -160, lower: -95 },
          { upper: -40, lower: -60 },
        ],
        legs: [legToFloor({ x: 72, y: 80 }, -74)],
      },
    ],
    gear: { gear: 'dumbbells' },
    props: [{ prop: 'floor' }, { prop: 'bench', at: { x: 104, y: 92 }, angle: 0, length: 44 }],
    arrow: 'hand',
  },
  'Podciąganie na drążku': pullup(true),
  'Ściąganie drążka wyciągu górnego': seatedPull(
    { gear: 'cable', pulley: { x: 128, y: 26 } },
    { upper: 52, lower: 40 },
    { upper: -30, lower: 122 },
    { prop: 'tower', x: 134, top: 24 },
  ),
  'Wiosłowanie na wyciągu dolnym siedząc': seatedPull(
    { gear: 'cable', pulley: { x: 146, y: 98 } },
    { upper: -12, lower: -6 },
    { upper: -62, lower: 172 },
    { prop: 'tower', x: 152, top: 92 },
  ),
  Superman: {
    phases: [
      supine(0, [{ upper: 10, lower: 5 }], [{ upper: 180, lower: 180, foot: 220 }]),
      supine(18, [{ upper: 36, lower: 32 }], [{ upper: 198, lower: 204, foot: 244 }], 76, LYING - 3),
    ],
    arrow: 'hand',
  },
  'Podciąganie podchwytem': pullup(false),
  'Wiosłowanie hantlami w opadzie': bentRow({ gear: 'dumbbells' }),
  'Szrugsy ze sztangą': {
    phases: [front(HANGING)],
    gear: { gear: 'barbell' },
    hint: { from: { x: 104, y: 60 }, to: { x: 104, y: 44 } },
  },
  'Przyciąganie gumy do brzucha siedząc': {
    phases: [
      {
        hip: { x: 74, y: LYING - 2 },
        torso: 86,
        arms: [{ upper: -16, lower: -8 }],
        legs: [{ upper: -8, lower: -4, foot: 86 }],
      },
      {
        hip: { x: 74, y: LYING - 2 },
        torso: 96,
        arms: [{ upper: -72, lower: 168 }],
        legs: [{ upper: -8, lower: -4, foot: 86 }],
      },
    ],
    gear: { gear: 'band', anchor: { x: 112, y: LYING - 4 } },
    arrow: 'hand',
  },

  // Barki
  'Wyciskanie żołnierskie (OHP)': overheadPress({ gear: 'barbell' }),
  'Wyciskanie hantli nad głowę siedząc': overheadPress({ gear: 'dumbbells' }, true),
  'Unoszenie hantli bokiem': {
    phases: [front({ upper: -80, lower: -85 }), front({ upper: -2, lower: 2 })],
    gear: { gear: 'dumbbells' },
  },
  'Face pull na wyciągu': {
    phases: [side({ upper: 10, lower: 4 }), side({ upper: 36, lower: 134 })],
    gear: { gear: 'cable', pulley: { x: 144, y: 44 } },
    props: [{ prop: 'floor' }, { prop: 'tower', x: 150, top: 42 }],
  },
  'Wyciskanie Arnolda': {
    phases: [front({ upper: -26, lower: 152 }), front({ upper: 60, lower: 78 })],
    gear: { gear: 'dumbbells' },
  },
  'Unoszenie hantli w opadzie': {
    phases: [
      { hip: { x: 74, y: 82 }, torso: 22, arms: [{ upper: -90, lower: -90 }], legs: [legToFloor({ x: 74, y: 82 }, -72)] },
      { hip: { x: 74, y: 82 }, torso: 22, arms: [{ upper: -176, lower: -176 }], legs: [legToFloor({ x: 74, y: 82 }, -72)] },
    ],
    gear: { gear: 'dumbbells' },
    arrow: 'hand',
  },
  'Rozciąganie gumy przed sobą': {
    phases: [front({ upper: -20, lower: 150 }), front({ upper: -5, lower: 5 })],
    gear: { gear: 'band', anchor: { x: 86, y: 51 } },
  },
  'Face pull z gumą': {
    phases: [side({ upper: 10, lower: 4 }), side({ upper: 36, lower: 134 })],
    gear: { gear: 'band', anchor: { x: 150, y: 44 } },
  },

  // Biceps / triceps / przedramiona
  'Uginanie ramion ze sztangą': curl({ gear: 'barbell' }),
  'Uginanie ramion z hantlami (młotkowe)': curl({ gear: 'dumbbells' }),
  'Prostowanie ramion na wyciągu': {
    phases: [side({ upper: -80, lower: 20 }), side({ upper: -85, lower: -80 })],
    gear: { gear: 'cable', pulley: { x: 136, y: 26 } },
    props: [{ prop: 'floor' }, { prop: 'tower', x: 142, top: 24 }],
  },
  'Wyciskanie francuskie hantlem': {
    phases: [side({ upper: 95, lower: 198 }), side({ upper: 90, lower: 94 })],
    gear: { gear: 'dumbbells', single: true },
  },
  'Pompki na krześle (dipy)': {
    phases: [
      anchor(
        { hip: { x: 84, y: 96 }, torso: 100, arms: [{ upper: -135, lower: -135 }], legs: [{ upper: -14, lower: -14, foot: 62 }] },
        'hand',
        { x: 62, y: 88 },
      ),
      anchor(
        { hip: { x: 84, y: 96 }, torso: 100, arms: [{ upper: -178, lower: -80 }], legs: [{ upper: -14, lower: -14, foot: 62 }] },
        'hand',
        { x: 62, y: 88 },
      ),
    ],
    props: [{ prop: 'floor' }, { prop: 'box', at: { x: 34, y: 88 }, width: 28, height: 24 }],
    arrow: 'hip',
  },
  'Spacer farmera': {
    phases: [
      {
        hip: STAND,
        torso: 90,
        arms: both(HANGING),
        legs: [legToFloor(STAND, -74), legToFloor(STAND, -106, 180)],
      },
    ],
    gear: { gear: 'dumbbells' },
    hint: { from: { x: 118, y: 70 }, to: { x: 148, y: 70 } },
  },
  'Uginanie ramion ze sztangą łamaną': curl({ gear: 'ezbar' }),
  'Uginanie ramion z hantlami na ławce skośnej': {
    phases: [
      { hip: { x: 62, y: 84 }, torso: 62, arms: [{ upper: -100, lower: -98 }], legs: [legToFloor({ x: 62, y: 84 }, -46)] },
      { hip: { x: 62, y: 84 }, torso: 62, arms: [{ upper: -96, lower: 18 }], legs: [legToFloor({ x: 62, y: 84 }, -46)] },
    ],
    gear: { gear: 'dumbbells' },
    props: [{ prop: 'floor' }, { prop: 'bench', at: { x: 52, y: 96 }, angle: 62, length: 48 }],
  },
  'Uginanie nadgarstków ze sztangą': {
    phases: [
      { hip: { x: 74, y: 95 }, torso: 66, arms: [{ upper: -50, lower: -28 }], legs: [legToFloor({ x: 74, y: 95 }, 0)] },
      { hip: { x: 74, y: 95 }, torso: 66, arms: [{ upper: -50, lower: 8 }], legs: [legToFloor({ x: 74, y: 95 }, 0)] },
    ],
    gear: { gear: 'ezbar' },
    props: [{ prop: 'floor' }, { prop: 'bench', at: { x: 56, y: 99 }, angle: 0, length: 40 }],
  },
  'Wyciskanie francuskie ze sztangą łamaną': lyingExtension({ gear: 'ezbar' }),
  'Wyciskanie sztangi wąskim chwytem': {
    // Ten sam ruch co na ławce płaskiej, ale łokcie przy tułowiu — to cała różnica.
    phases: [
      { hip: { x: 66, y: 82 }, torso: 0, arms: [{ upper: 186, lower: 56 }], legs: [legToFloor({ x: 66, y: 82 }, -125)] },
      { hip: { x: 66, y: 82 }, torso: 0, arms: [{ upper: 85, lower: 92 }], legs: [legToFloor({ x: 66, y: 82 }, -125)] },
    ],
    gear: { gear: 'barbell' },
    props: [{ prop: 'floor' }, FLAT_BENCH],
  },
  'Prostowanie ramion z gumą nad głowę': {
    phases: [side({ upper: 95, lower: 198 }), side({ upper: 90, lower: 94 })],
    gear: { gear: 'band', anchor: { x: 46, y: FLOOR } },
  },

  // Nogi
  'Przysiad ze sztangą': squat({ gear: 'barbell' }, { arms: { upper: 170, lower: 10 } }),
  'Przysiad goblet': squat({ gear: 'kettlebell' }, { arms: { upper: -46, lower: 42 }, torso: 80 }),
  'Przysiad z masą ciała': squat({ gear: 'none' }, { arms: { upper: -8, lower: 4 }, torso: 76 }),
  'Wypychanie nogami na maszynie': {
    phases: [
      { hip: { x: 86, y: 96 }, torso: 160, arms: [{ upper: -110, lower: -100 }], legs: [{ upper: 75, lower: -15, foot: 120 }] },
      { hip: { x: 86, y: 96 }, torso: 160, arms: [{ upper: -110, lower: -100 }], legs: [{ upper: 30, lower: 30, foot: 120 }] },
    ],
    props: [
      { prop: 'floor' },
      { prop: 'bench', at: { x: 90, y: 100 }, angle: 160, length: 46 },
      { prop: 'pad', at: { x: 115.8, y: 68.4 }, angle: -60, length: 36 },
    ],
    arrow: 'ankle',
  },
  'Wykroki z hantlami': lunge({ gear: 'dumbbells' }),
  'Wykroki bez obciążenia': lunge({ gear: 'none' }),
  'Martwy ciąg rumuński': hinge({ gear: 'barbell' }, { torso: 22, hip: { x: 78, y: 82 }, knee: -80 }),
  'Uginanie nóg na maszynie': {
    phases: [
      {
        hip: { x: 92, y: 88 },
        torso: 178,
        arms: [{ upper: 186, lower: 184 }],
        legs: [{ upper: -4, lower: -2, foot: -92 }],
      },
      {
        hip: { x: 92, y: 88 },
        torso: 178,
        arms: [{ upper: 186, lower: 184 }],
        legs: [{ upper: -4, lower: 72, foot: -18 }],
      },
    ],
    props: [
      { prop: 'floor' },
      { prop: 'bench', at: { x: 56, y: 92 }, angle: 0, length: 62 },
      { prop: 'pad', at: { x: 126, y: 82 }, angle: -90, length: 14 },
    ],
    arrow: 'ankle',
  },
  'Hip thrust ze sztangą': {
    phases: [
      { hip: { x: 70, y: 100 }, torso: 145, arms: [{ upper: -20, lower: -26 }], legs: [{ upper: 20, lower: -70 }] },
      { hip: { x: 70, y: 90 }, torso: 167, arms: [{ upper: -2, lower: 2 }], legs: [{ upper: -14, lower: -70 }] },
    ],
    gear: { gear: 'barbell' },
    props: [{ prop: 'floor' }, { prop: 'bench', at: { x: 30, y: 86 }, angle: 0, length: 34 }],
    arrow: 'hip',
  },
  'Mostek biodrowy': {
    phases: [
      supine(0, [{ upper: 188, lower: 186 }], [kneesUp], 82),
      { hip: { x: 84, y: 96 }, torso: -25, arms: [{ upper: 186, lower: 184 }], legs: [{ upper: 192, lower: 210, foot: 180 }] },
    ],
    arrow: 'hip',
  },
  'Odwodzenie bioder z gumą': {
    // Guma nad kolanami: w półprzysiadzie kolana raz uciekają do środka, raz idą na zewnątrz.
    phases: [
      { hip: HALF_SQUAT, torso: 86, arms: both(HANGING), legs: [reach(HALF_SQUAT, { x: 96, y: FLOOR }, -1), flip(reach(HALF_SQUAT, { x: 96, y: FLOOR }, -1))] },
      { hip: HALF_SQUAT, torso: 86, arms: both(HANGING), legs: [reach(HALF_SQUAT, { x: 96, y: FLOOR }, 1), flip(reach(HALF_SQUAT, { x: 96, y: FLOOR }, 1))] },
    ],
    gear: { gear: 'kneeBand' },
    hint: { from: { x: 108, y: 98 }, to: { x: 122, y: 98 } },
  },
  'Kettlebell swing': {
    phases: [
      planted({
        hip: { x: 74, y: 86 },
        torso: 26,
        arms: [{ upper: -62, lower: -76 }],
        legs: [legToFloor({ x: 74, y: 86 }, -66)],
      }),
      planted({ hip: STAND, torso: 90, arms: [{ upper: -8, lower: -4 }], legs: [legToFloor(STAND, -90)] }),
    ],
    gear: { gear: 'kettlebell' },
    arrow: 'hand',
    spread: 40,
  },
  'Wspięcia na palce stojąc': calfRaise({ gear: 'none' }),
  'Przysiad bułgarski z hantlami': lunge({ gear: 'dumbbells' }, true),
  'Przysiad przedni ze sztangą': squat({ gear: 'barbell' }, { arms: { upper: 8, lower: 128 }, torso: 80 }),
  'Martwy ciąg rumuński jednonóż z hantlami': {
    phases: [
      planted({
        hip: STAND,
        torso: 90,
        arms: [{ upper: -90, lower: -90 }],
        legs: [legToFloor(STAND, -90), { upper: -82, lower: -86 }],
      }),
      planted({
        hip: { x: 80, y: 80 },
        torso: 16,
        arms: [{ upper: -90, lower: -90 }],
        legs: [legToFloor({ x: 80, y: 80 }, -86), { upper: 186, lower: 182, foot: 96 }],
      }),
    ],
    gear: { gear: 'dumbbells' },
    arrow: 'hand',
    spread: 44,
  },
  'Dobry ranek ze sztangą': hinge(
    { gear: 'barbell' },
    { torso: 10, hip: { x: 78, y: 80 }, knee: -84, arms: { upper: 170, lower: 10 } },
  ),
  'Wspięcia na palce z hantlami': calfRaise({ gear: 'dumbbells' }),

  // Brzuch i core
  'Plank (deska)': {
    phases: [
      anchor(
        { hip: { x: 80, y: 102 }, torso: 12, arms: [{ upper: -80, lower: -8 }], legs: [{ upper: 192, lower: 192, foot: -20 }] },
        'toe',
        { x: 50, y: FLOOR },
      ),
    ],
  },
  'Brzuszki (crunch)': {
    phases: [supine(0, [{ upper: 160, lower: 170 }], [kneesUp]), supine(26, [{ upper: 190, lower: 200 }], [kneesUp])],
    arrow: 'head',
  },
  'Unoszenie nóg w zwisie': {
    phases: [
      anchor(
        { hip: { x: 88, y: 74 }, torso: 90, arms: [{ upper: 90, lower: 90 }], legs: [{ upper: -90, lower: -90, foot: 0 }] },
        'hand',
        { x: 88, y: 22 },
      ),
      anchor(
        { hip: { x: 88, y: 74 }, torso: 90, arms: [{ upper: 90, lower: 90 }], legs: [{ upper: -4, lower: 0, foot: 86 }] },
        'hand',
        { x: 88, y: 22 },
      ),
    ],
    props: [{ prop: 'floor' }, { prop: 'bar', at: { x: 88, y: 22 }, width: 52 }],
    arrow: 'ankle',
  },
  'Martwy robak (dead bug)': {
    phases: [
      supine(
        0,
        [
          { upper: 92, lower: 90 },
          { upper: 20, lower: 10 },
        ],
        [
          { upper: 100, lower: 20, foot: 110 },
          { upper: 176, lower: 178, foot: 140 },
        ],
      ),
      supine(
        0,
        [
          { upper: 20, lower: 10 },
          { upper: 92, lower: 90 },
        ],
        [
          { upper: 176, lower: 178, foot: 140 },
          { upper: 100, lower: 20, foot: 110 },
        ],
      ),
    ],
    arrow: 'none',
  },
  'Deska boczna': {
    phases: [
      anchor(
        {
          hip: { x: 80, y: 102 },
          torso: 14,
          arms: [
            { upper: -76, lower: -6 },
            { upper: 104, lower: 100 },
          ],
          legs: [{ upper: 194, lower: 194, foot: -20 }],
        },
        'toe',
        { x: 48, y: FLOOR },
      ),
    ],
  },
  'Pallof press z gumą': {
    phases: [
      { hip: STAND, torso: 90, arms: [{ upper: -110, lower: 80 }], legs: [legToFloor(STAND, -90, 180)], facing: -1 },
      { hip: STAND, torso: 90, arms: [{ upper: 186, lower: 182 }], legs: [legToFloor(STAND, -90, 180)], facing: -1 },
    ],
    gear: { gear: 'band', anchor: { x: 150, y: 56 } },
    arrow: 'hand',
  },
  'Skręty tułowia z hantlem': {
    phases: [
      {
        hip: { x: 86, y: 86 },
        torso: 90,
        arms: [
          { upper: -20, lower: -10 },
          { upper: -40, lower: -20 },
        ],
        legs: stance({ x: 86, y: 86 }, 20),
      },
      {
        hip: { x: 86, y: 86 },
        torso: 90,
        arms: [
          { upper: 200, lower: 190 },
          { upper: 220, lower: 200 },
        ],
        legs: stance({ x: 86, y: 86 }, 20),
      },
    ],
    gear: { gear: 'dumbbells', single: true },
    props: [{ prop: 'floor' }, { prop: 'box', at: { x: 74, y: 92 }, width: 24, height: 20 }],
    arrow: 'hand',
  },
  'Unoszenie nóg leżąc': {
    phases: [
      supine(0, [{ upper: 188, lower: 186 }], [{ upper: 180, lower: 180, foot: 140 }]),
      supine(0, [{ upper: 188, lower: 186 }], [{ upper: 92, lower: 90, foot: 0 }]),
    ],
    arrow: 'ankle',
  },
};

export function illustrationFor(name: string): Illustration | undefined {
  return exerciseIllustrations[name];
}
