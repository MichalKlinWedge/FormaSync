import { useEffect, useRef } from 'react';

import { countdownCue } from './countdown-cues';

/**
 * Odliczanie słychać, a nie tylko widać — i przerwę między seriami, i serię na czas. Telefon leży
 * zwykle ekranem w dół albo na ławce obok; końcówkę trzeba usłyszeć, żeby zdążyć wrócić pod
 * sztangę albo wiedzieć, ile jeszcze trzymać. Kiedy dokładnie, mówi `countdown-cues`; tu zostaje
 * samo odtwarzanie.
 *
 * Moduł dźwięku wczytujemy leniwie i w osłonie. Aktualizacja OTA potrafi wyprzedzić wgranie
 * nowej paczki, a wtedy modułu natywnego jeszcze nie ma; zwykły import wywróciłby wtedy cały
 * ekran trwającego treningu — czyli odebrałby możliwość jego zatrzymania. Brak dźwięku jest
 * akceptowalny, brak ekranu nie jest.
 */

type Player = { seekTo: (seconds: number) => void; play: () => void };
type Players = { tick: Player; final: Player; warning: Player };
type AudioModule = {
  createAudioPlayer: (source: unknown) => Player;
  setAudioModeAsync: (mode: Record<string, boolean>) => Promise<void>;
};

// Odtwarzacze zakładamy raz na proces: tworzenie ich przy każdym piknięciu dawałoby
// opóźnienie rzędu dziesiątek milisekund, a przy odliczaniu sekund to słychać.
let players: Players | null = null;
let unavailable = false;

function sounds(): Players | null {
  if (players || unavailable) return players;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('expo-audio') as AudioModule;
    players = {
      tick: audio.createAudioPlayer(require('../../../assets/sounds/beep.wav')),
      final: audio.createAudioPlayer(require('../../../assets/sounds/beep-end.wav')),
      warning: audio.createAudioPlayer(require('../../../assets/sounds/bell.wav')),
    };
    // Pikanie nie ma uciszać muzyki, z którą się trenuje — ma się w nią wmieszać.
    void audio
      .setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false })
      .catch(() => {});
  } catch {
    unavailable = true;
  }
  return players;
}

function play(pick: (all: Players) => Player): void {
  const all = sounds();
  if (!all) return;
  try {
    const player = pick(all);
    player.seekTo(0);
    player.play();
  } catch {
    // Brak dźwięku nie może przerwać treningu — odliczanie widać też na ekranie.
  }
}

/**
 * Dzwoni na dziesięć sekund przed końcem, pika w ostatnich pięciu raz na sekundę, a na zerze
 * daje dłuższy sygnał. `remainingSeconds` to null, gdy nic nie odlicza; pominięta przerwa milczy.
 */
export function useCountdownSound(remainingSeconds: number | null, enabled = true): void {
  // Pamiętamy ostatnią odegraną sekundę, żeby przerysowanie ekranu nie piknęło drugi raz.
  const lastPlayed = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || remainingSeconds === null) {
      lastPlayed.current = null;
      return;
    }
    const cue = countdownCue(remainingSeconds);
    if (cue === null) return;
    // Uśpiona aplikacja przeskakuje sekundy, więc zero rozpoznajemy po sygnale, a nie po
    // liczbie: inaczej każda ujemna sekunda odgrywałaby koniec jeszcze raz.
    const playedKey = cue === 'end' ? 0 : remainingSeconds;
    if (lastPlayed.current === playedKey) return;
    lastPlayed.current = playedKey;
    play((all) => (cue === 'warning' ? all.warning : cue === 'end' ? all.final : all.tick));
  }, [remainingSeconds, enabled]);
}

/** Dłuższy sygnał w chwili, gdy odliczanie dobiega zera. */
export function playCountdownEndSound(): void {
  play((all) => all.final);
}
