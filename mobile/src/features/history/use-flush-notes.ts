import { useEffect, useRef } from 'react';

import { db } from '@/db/client';

import { updateSessionMeta } from './repository';

/** Po tylu milisekundach ciszy w pisaniu notatka trafia do bazy. */
const QUIET_MS = 800;

/**
 * Pilnuje, żeby uwagi po treningu nie przepadły. Samo `onBlur` nie wystarcza: wyjście z ekranu
 * przyciskiem Wstecz odmontowuje pole bez utraty fokusu, więc wpisany tekst nigdy nie trafiał
 * do bazy. Zapisujemy więc po chwili przerwy w pisaniu i jeszcze raz przy opuszczeniu ekranu.
 *
 * `enabled` jest po to, że ekran historii osadza widok wytrzymałościowy jako dziecko. Oba
 * trzymają własny stan notatki, a dziecko odmontowuje się pierwsze — rodzic nadpisałby świeży
 * tekst swoją nieaktualną kopią.
 */
export function useFlushNotes(sessionId: number, notes: string, enabled = true): void {
  const latest = useRef(notes);
  // Wartość wczytana z bazy — od niej liczymy, czy w ogóle jest co zapisywać.
  const saved = useRef(notes.trim() || null);

  useEffect(() => {
    latest.current = notes;
  }, [notes]);

  const save = (value: string) => {
    const text = value.trim() || null;
    if (text === saved.current) return;
    saved.current = text;
    updateSessionMeta(db, sessionId, { userNotes: text });
  };

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => save(latest.current), QUIET_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, enabled, sessionId]);

  useEffect(() => {
    if (!enabled) return;
    return () => save(latest.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId]);
}
