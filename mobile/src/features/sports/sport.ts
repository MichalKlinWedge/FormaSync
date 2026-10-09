import type { Icon } from '@/components/icon';
import { type Sport, sports } from '@/db/schema';

/**
 * Wybrany sport decyduje, co pokazują ekrany planów, historii i „Dziś”. Trzymamy go w ustawieniach,
 * a nie w pamięci procesu, żeby przetrwał zamknięcie aplikacji — przełączanie przy każdym wejściu
 * byłoby uciążliwe dla kogoś, kto trenuje głównie jedną dyscyplinę.
 */
export const ACTIVE_SPORT_KEY = 'active_sport';

type IconName = Parameters<typeof Icon>[0]['name'];

export const SPORT_LABELS: Record<Sport, string> = {
  STRENGTH: 'Siła',
  RUNNING: 'Bieganie',
  CYCLING: 'Rower',
  SWIMMING: 'Pływanie',
  OTHER: 'Różne',
};

/** Ikony Material Symbols — te same nazwy działają w całej aplikacji. */
export const SPORT_ICONS = {
  STRENGTH: 'fitness_center',
  RUNNING: 'directions_run',
  CYCLING: 'directions_bike',
  SWIMMING: 'pool',
  OTHER: 'interests',
} as const satisfies Record<Sport, IconName>;

/** Siła liczy serie i ciężar, reszta — czas albo dystans. Ten podział rządzi całą resztą modelu. */
export const isEndurance = (sport: Sport): boolean => sport !== 'STRENGTH';

/**
 * Garmin przyjmuje treningi tylko w swoich dyscyplinach, a na „Różne” nie ma u niego kategorii.
 * Taki plan zostaje w telefonie: w kalendarzu aplikacji, w historii i w statystykach.
 */
export const goesToGarmin = (sport: Sport): boolean => sport !== 'OTHER';

export const isSport = (value: string | null): value is Sport =>
  value !== null && (sports as readonly string[]).includes(value);
