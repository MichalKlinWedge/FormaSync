import { create } from 'zustand';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';

import { DEFAULT_POOL_LENGTH, POOL_LENGTH_KEY } from './swim';

/**
 * Długość basenu, na którym się pływa. To ustawienie, a nie cecha planu: ten sam plan
 * „10×100 m” pływa się inaczej na dwudziestce piątce niż na pięćdziesiątce, a basen zmienia
 * się rzadziej niż plany.
 */

function stored(): number {
  try {
    const value = Number(getSetting(db, POOL_LENGTH_KEY));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_POOL_LENGTH;
  } catch {
    // Odczyt sprzed migracji (świeża instalacja) — wartość dojdzie przez hydrate().
    return DEFAULT_POOL_LENGTH;
  }
}

type PoolState = {
  poolLength: number;
  setPoolLength: (meters: number) => void;
  hydrate: () => void;
};

export const usePoolStore = create<PoolState>((set) => ({
  poolLength: stored(),
  setPoolLength: (poolLength) => {
    if (!Number.isFinite(poolLength) || poolLength <= 0) return;
    setSetting(db, POOL_LENGTH_KEY, String(poolLength));
    set({ poolLength });
  },
  hydrate: () => set({ poolLength: stored() }),
}));

export const usePoolLength = (): number => usePoolStore((state) => state.poolLength);
