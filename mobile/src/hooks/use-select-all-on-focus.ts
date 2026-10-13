import { useCallback, useMemo, useState } from 'react';

/**
 * Zaznaczenie całej zawartości pola przy wejściu w nie — żeby wpisanie cyfry zastąpiło to, co
 * stoi domyślnie, zamiast dopisać się obok.
 *
 * Wbudowane `selectTextOnFocus` robi to źle w polu sterowanym z Reacta. Na Androidzie ustawia
 * natywną flagę „zaznacz wszystko”, która odpala się **ponownie** przy każdym podstawieniu tekstu
 * z zewnątrz — a takie podstawienie robimy sami po każdym znaku, bo `value` pilnuje, żeby w polu
 * liczbowym nie została litera. Skutek widać było w całej aplikacji: pierwsza cyfra wchodziła, ale
 * zostawała zaznaczona, więc druga ją kasowała i dopiero trzecia dopisywała się normalnie.
 *
 * Tutaj zaznaczenie jest jednorazowe i sterowane: trzymamy je tylko do pierwszej zmiany, a potem
 * oddajemy kursor polu. Dzięki temu nie ma czego odpalić po raz drugi.
 */
export function useSelectAllOnFocus(text: string) {
  const [selecting, setSelecting] = useState(false);

  return {
    /**
     * `undefined` znaczy „kursorem rządzi pole”, i tak jest przez większość czasu. Obiekt
     * zapamiętujemy, bo nowy przy każdym renderze wyglądałby dla pola jak nowe polecenie:
     * przerysowanie ekranu w trakcie pisania przestawiałoby kursor na początek.
     */
    selection: useMemo(
      () => (selecting ? { start: 0, end: text.length } : undefined),
      [selecting, text.length],
    ),
    beginSelecting: useCallback(() => setSelecting(true), []),
    stopSelecting: useCallback(() => setSelecting(false), []),
  };
}
