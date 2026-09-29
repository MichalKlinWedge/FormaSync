import { create } from 'zustand';

import { type PlanDraft } from './draft';

type PlanDraftState = {
  draft: PlanDraft | null;
  /** Stan wyjściowy do wykrywania niezapisanych zmian. */
  baseline: string | null;
  start: (draft: PlanDraft) => void;
  apply: (update: (draft: PlanDraft) => PlanDraft) => void;
  clear: () => void;
};

// Wersja robocza współdzielona przez kreator planu i ekran wyboru ćwiczeń.
export const usePlanDraftStore = create<PlanDraftState>((set) => ({
  draft: null,
  baseline: null,
  start: (draft) => set({ draft, baseline: serialize(draft) }),
  apply: (update) => set((state) => (state.draft ? { draft: update(state.draft) } : state)),
  clear: () => set({ draft: null, baseline: null }),
}));

export function isDraftDirty(draft: PlanDraft | null, baseline: string | null): boolean {
  return draft !== null && serialize(draft) !== baseline;
}

// Klucze pozycji są techniczne — nie wpływają na to, czy plan się zmienił.
const serialize = (draft: PlanDraft) =>
  JSON.stringify({ ...draft, items: draft.items.map(({ key: _, ...item }) => item) });
