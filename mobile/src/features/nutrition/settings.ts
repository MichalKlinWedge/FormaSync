import { getSetting, setSetting } from '@/db/settings';
import type { SyncDb } from '@/db/types';

import { activityLevels, type ActivityLevel } from './energy';
import { DEFAULT_RATE, dietModes, type DietMode, PROTEIN_PER_KG, PROTEIN_RANGE, RATE_MAX } from './goal';

/**
 * Ustawienia kalorii w tabeli klucz–wartość, tak jak nawodnienie. Odczyt jest wyrozumiały:
 * wartość nie z tego świata ma dać wartość domyślną, a nie zepsuty ekran.
 *
 * Tempo i białko trzymamy jako „null = domyślne dla trybu”. Dzięki temu zmiana celu z redukcji
 * na masę przestawia je sama, a wpisane ręcznie zostaje wpisane ręcznie.
 */

export const ACTIVITY_KEY = 'nutrition_activity';
export const MODE_KEY = 'nutrition_mode';
export const RATE_KEY = 'nutrition_rate';
export const PROTEIN_KEY = 'nutrition_protein_per_kg';
export const TARGET_KEY = 'nutrition_target_kcal';

export const DEFAULT_ACTIVITY: ActivityLevel = 'LIGHT';
export const DEFAULT_MODE: DietMode = 'MAINTENANCE';

export type NutritionSettings = {
  activity: ActivityLevel;
  mode: DietMode;
  /** Tempo zmiany masy ciała w kg na tydzień; null = domyślne dla trybu. */
  ratePerWeek: number | null;
  /** Białko w g na kg masy ciała; null = domyślne dla trybu. */
  proteinPerKg: number | null;
  /** Stały budżet dnia wpisany ręcznie; null = policz ze wzoru. */
  manualKcal: number | null;
};

export type RawNutritionSettings = {
  activity?: string | null;
  mode?: string | null;
  rate?: string | null;
  protein?: string | null;
  target?: string | null;
};

const number = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const within = (value: number | null, min: number, max: number): number | null =>
  value !== null && value >= min && value <= max ? value : null;

export function nutritionSettingsFrom(raw: RawNutritionSettings): NutritionSettings {
  return {
    activity: activityLevels.find((level) => level === raw.activity) ?? DEFAULT_ACTIVITY,
    mode: dietModes.find((mode) => mode === raw.mode) ?? DEFAULT_MODE,
    ratePerWeek: within(number(raw.rate), 0, RATE_MAX),
    proteinPerKg: within(number(raw.protein), PROTEIN_RANGE.min, PROTEIN_RANGE.max),
    manualKcal: within(number(raw.target), 500, 10000),
  };
}

export const resolvedRate = (settings: NutritionSettings): number =>
  settings.ratePerWeek ?? DEFAULT_RATE[settings.mode];

export const resolvedProtein = (settings: NutritionSettings): number =>
  settings.proteinPerKg ?? PROTEIN_PER_KG[settings.mode];

export function loadNutritionSettings(db: SyncDb): NutritionSettings {
  return nutritionSettingsFrom({
    activity: getSetting(db, ACTIVITY_KEY),
    mode: getSetting(db, MODE_KEY),
    rate: getSetting(db, RATE_KEY),
    protein: getSetting(db, PROTEIN_KEY),
    target: getSetting(db, TARGET_KEY),
  });
}

export function saveNutritionSettings(db: SyncDb, patch: Partial<NutritionSettings>): void {
  if (patch.activity !== undefined) setSetting(db, ACTIVITY_KEY, patch.activity);
  if (patch.mode !== undefined) setSetting(db, MODE_KEY, patch.mode);
  if ('ratePerWeek' in patch) {
    setSetting(db, RATE_KEY, patch.ratePerWeek === null ? null : String(patch.ratePerWeek));
  }
  if ('proteinPerKg' in patch) {
    setSetting(db, PROTEIN_KEY, patch.proteinPerKg === null ? null : String(patch.proteinPerKg));
  }
  if ('manualKcal' in patch) {
    setSetting(db, TARGET_KEY, patch.manualKcal === null ? null : String(patch.manualKcal));
  }
}

export const GUIDANCE_KEY = 'nutrition_guidance';

/** Najdłuższe wytyczne, jakie wysyłamy. Dalej to już nie wskazówka, tylko druga dieta. */
export const GUIDANCE_LIMIT = 1000;

/**
 * Wytyczne żywieniowe: czego nie jadasz, na co masz alergię, ile masz rano czasu. Bez nich
 * propozycja jest poprawna kalorycznie i ślepa na to, czego i tak nie zjesz — a sam budżet
 * tego nie wie i nigdy się nie dowie.
 */
export const nutritionGuidance = (db: SyncDb): string => (getSetting(db, GUIDANCE_KEY) ?? '').trim();

export const saveNutritionGuidance = (db: SyncDb, value: string | null): void =>
  setSetting(db, GUIDANCE_KEY, value?.trim().slice(0, GUIDANCE_LIMIT) || null);
