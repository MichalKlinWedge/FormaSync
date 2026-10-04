import { create } from 'zustand';

import type { EnduranceDraft } from './draft';

type EnduranceDraftState = {
  draft: EnduranceDraft | null;
  start: (draft: EnduranceDraft) => void;
  apply: (update: (draft: EnduranceDraft) => EnduranceDraft) => void;
  clear: () => void;
};

/** Wersja robocza planu wytrzymałościowego, osobna od siłowej — modele nie mają wspólnych pól. */
export const useEnduranceDraftStore = create<EnduranceDraftState>((set) => ({
  draft: null,
  start: (draft) => set({ draft }),
  apply: (update) => set((state) => (state.draft ? { draft: update(state.draft) } : state)),
  clear: () => set({ draft: null }),
}));
