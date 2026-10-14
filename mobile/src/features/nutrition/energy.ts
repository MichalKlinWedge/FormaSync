import type { Sport } from '@/db/schema';
import type { Sex } from '@/features/profile/profile';

import { formatKcal } from './format';
import { dailyDelta, type DietMode, MODE_FOR_LABELS } from './goal';

/**
 * Wydatek energetyczny dnia i wynikający z niego budżet kalorii.
 *
 * Liczymy go sami, a nie bierzemy z zegarka. Garmin podaje kalorie dnia z tętna i kroków, ale
 * o jedzeniu nie wie nic, a jego liczba zmienia się po każdej synchronizacji — budżet, który
 * skacze po południu, jest bezużyteczny. Tu wychodzi z czterech rzeczy, które się nie chwieją:
 * przemiany podstawowej, ruchu w ciągu dnia, dzisiejszego treningu i celu diety.
 *
 * Wszystkie wzory poniżej są przybliżeniami dla populacji, nie pomiarem. Prawdziwy wydatek
 * własnego ciała wychodzi dopiero z kilku tygodni liczenia i wagi — i to on z czasem ma tu wejść
 * na miejsce wzoru.
 */

export const activityLevels = ['SEDENTARY', 'LIGHT', 'MODERATE', 'HIGH'] as const;
export type ActivityLevel = (typeof activityLevels)[number];

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  SEDENTARY: 'siedząco',
  LIGHT: 'lekko',
  MODERATE: 'średnio',
  HIGH: 'ciężko',
};

export const ACTIVITY_NOTES: Record<ActivityLevel, string> = {
  SEDENTARY: 'biurko i samochód, poza treningiem prawie bez ruchu',
  LIGHT: 'biurko, ale codzienne spacery i schody',
  MODERATE: 'dużo chodzenia albo praca na nogach',
  HIGH: 'praca fizyczna przez cały dzień',
};

/**
 * Mnożnik przemiany podstawowej za sam ruch dnia — **bez treningu**, bo trening dokładamy osobno
 * z jego czasu. Dlatego liczby są niższe od tych z kalkulatorów, które trening mają już w sobie:
 * wzięte stamtąd policzyłyby bieg dwa razy.
 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.3,
  MODERATE: 1.45,
  HIGH: 1.6,
};

/**
 * Koszt godziny wysiłku w MET — ile razy drożej niż leżenie. Wartości za tabelami aktywności,
 * dla tempa „trenuję”, a nie „ścigam się”: bieg 9,8 to około 6 min/km, siła 5 to seria z przerwą.
 */
export const SPORT_MET: Record<Sport, number> = {
  STRENGTH: 5,
  RUNNING: 9.8,
  CYCLING: 7.5,
  SWIMMING: 7,
  OTHER: 5,
};

/** Zaokrąglamy do dziesiątek: „2 310 kcal” czyta się jak cel, „2 313 kcal” jak wynik pomiaru. */
const STEP = 10;
const toStep = (kcal: number): number => Math.round(kcal / STEP) * STEP;

/**
 * Przemiana podstawowa wzorem Mifflina–St Jeora — dziś najdokładniejszym z prostych wzorów
 * dla osób bez skrajnego składu ciała.
 */
export function basalRate(input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  years: number;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.years;
  return Math.round(input.sex === 'MALE' ? base + 5 : base - 161);
}

/**
 * Kalorie spalone w treningu: MET × 3,5 × masa / 200 na minutę. Wzór nie zna tętna ani tego, ile
 * kto stał nad sztangą, więc wynik jest szacunkiem — ale szacunkiem, który nie zmienia się po
 * synchronizacji.
 */
export function trainingBurn(sport: Sport, seconds: number, weightKg: number): number {
  if (seconds <= 0 || weightKg <= 0) return 0;
  return Math.round(((SPORT_MET[sport] * 3.5 * weightKg) / 200) * (seconds / 60));
}

/** Czego brakuje do wzoru. Bez którejkolwiek z tych rzeczy nie ma czego liczyć. */
export type EnergyGap = 'SEX' | 'HEIGHT' | 'AGE' | 'WEIGHT';

export const GAP_LABELS: Record<EnergyGap, string> = {
  SEX: 'płeć',
  HEIGHT: 'wzrost',
  AGE: 'rok urodzenia',
  WEIGHT: 'masa ciała',
};

export type EnergyInput = {
  sex: Sex | null;
  heightCm: number | null;
  years: number | null;
  weightKg: number | null;
  activity: ActivityLevel;
  /** Kalorie dzisiejszych zakończonych treningów. */
  trainingKcal: number;
  /**
   * Kalorie treningów zaplanowanych na dziś, których jeszcze nie było. Do budżetu nie wchodzą —
   * zjeść wolno to, co się już spaliło — ale pokazują, dokąd budżet dojdzie, gdy dzień wyjdzie
   * zgodnie z planem.
   */
  plannedKcal?: number;
  mode: DietMode;
  ratePerWeek: number;
  /** Stały budżet wpisany ręcznie; gdy jest, wzór i cel nie mają już nic do powiedzenia. */
  manualKcal: number | null;
};

export type DailyEnergy = {
  /** Budżet dnia; null, dopóki brakuje danych i nie ma budżetu ręcznego. */
  target: number | null;
  /** Przemiana podstawowa — podłoga budżetu. */
  bmr: number | null;
  /** Utrzymanie: przemiana podstawowa razy ruch dnia, bez treningu. */
  base: number | null;
  training: number;
  /** Kalorie treningów jeszcze nieodbytych — poza budżetem, ale w celu całego dnia. */
  planned: number;
  /** Cel całego dnia: budżet plus to, co dołoży zaplanowany trening. */
  dayTarget: number | null;
  /** Poprawka z celu diety: ujemna na redukcji, dodatnia na masie. */
  delta: number;
  missing: EnergyGap[];
  manual: boolean;
  /** Czy budżet podnieśliśmy do przemiany podstawowej, bo cel schodził poniżej. */
  floored: boolean;
};

export function dailyEnergy(input: EnergyInput): DailyEnergy {
  const missing: EnergyGap[] = [];
  if (input.sex === null) missing.push('SEX');
  if (input.heightCm === null) missing.push('HEIGHT');
  if (input.years === null) missing.push('AGE');
  if (input.weightKg === null || input.weightKg <= 0) missing.push('WEIGHT');

  const bmr =
    missing.length > 0
      ? null
      : basalRate({
          sex: input.sex as Sex,
          weightKg: input.weightKg as number,
          heightCm: input.heightCm as number,
          years: input.years as number,
        });

  const manual = input.manualKcal !== null && input.manualKcal > 0;
  const training = toStep(Math.max(input.trainingKcal, 0));
  const planned = toStep(Math.max(input.plannedKcal ?? 0, 0));
  const delta = manual ? 0 : toStep(dailyDelta(input.mode, input.ratePerWeek));
  const base = manual
    ? toStep(input.manualKcal as number)
    : bmr === null
      ? null
      : toStep(bmr * ACTIVITY_FACTORS[input.activity]);

  if (base === null) {
    return {
      target: null,
      dayTarget: null,
      bmr,
      base: null,
      training,
      planned,
      delta,
      missing,
      manual,
      floored: false,
    };
  }

  const sum = base + delta + training;
  // Poniżej przemiany podstawowej nie schodzimy. Takiego budżetu nie wolno podpowiadać, nawet
  // gdy ktoś sam ustawił kilogram na tydzień: to już nie dieta, tylko głodówka.
  const floor = bmr === null ? 0 : toStep(bmr);
  const floored = sum < floor;

  const target = Math.max(sum, floor);

  return {
    target,
    dayTarget: target + planned,
    bmr,
    base,
    training,
    planned,
    delta,
    missing,
    manual,
    floored,
  };
}

/** Z czego wyszedł budżet — żeby liczba na kafelku nie brała się z powietrza. */
export function describeEnergy(energy: DailyEnergy, mode: DietMode): string {
  if (energy.target === null) {
    return `Brakuje: ${energy.missing.map((gap) => GAP_LABELS[gap]).join(', ')}.`;
  }

  const parts = [`${formatKcal(energy.base as number)} ${energy.manual ? 'budżetu' : 'na utrzymanie'}`];
  if (energy.training > 0) parts.push(`+ ${formatKcal(energy.training)} za dzisiejszy trening`);
  if (energy.delta < 0) parts.push(`− ${formatKcal(-energy.delta)} na ${MODE_FOR_LABELS[mode]}`);
  if (energy.delta > 0) parts.push(`+ ${formatKcal(energy.delta)} na ${MODE_FOR_LABELS[mode]}`);
  const sentence = parts.join(' ');

  const floored = energy.floored
    ? `${sentence}. Podniesione do przemiany podstawowej — niżej nie schodzimy.`
    : sentence;

  // Zaplanowany trening doliczy się dopiero, gdy się odbędzie — ale cel całego dnia widać już
  // teraz, bo od niego zależy, ile da się rozpisać na posiłki.
  return energy.planned > 0
    ? `${floored}. Po zaplanowanym treningu (+${formatKcal(energy.planned)}) cel dnia to`
      + ` ${formatKcal(energy.dayTarget as number)}`
    : floored;
}

/** Cel białka z masy ciała. Null, dopóki nie znamy masy. */
export function proteinTarget(weightKg: number | null, perKg: number): number | null {
  return weightKg === null || weightKg <= 0 ? null : Math.round(weightKg * perKg);
}
