import { useEffect, useRef } from 'react';

import { restCue } from './rest-cues';

/**
 * Odliczanie końca przerwy słychać, a nie tylko widać. Telefon leży zwykle ekranem w dół
 * albo na ławce obok — końcówkę przerwy trzeba usłyszeć, żeby zdążyć wrócić pod sztangę.
 * Kiedy dokładnie, mówi `rest-cues`; tu zostaje samo odtwarzanie.
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
 * Dzwoni na dziesięć sekund przed końcem przerwy, potem pika w ostatnich pięciu, raz na sekundę.
 * `remainingSeconds` to null, gdy przerwa nie trwa; pominięcie przerwy nie pika.
 */
export function useRestCountdownSound(remainingSeconds: number | null, enabled = true): void {
  // Pamiętamy ostatnią odegraną sekundę, żeby przerysowanie ekranu nie piknęło drugi raz.
  const lastPlayed = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || remainingSeconds === null) {
      lastPlayed.current = null;
      return;
    }
    const cue = restCue(remainingSeconds);
    if (cue === null) return;
    if (lastPlayed.current === remainingSeconds) return;
    lastPlayed.current = remainingSeconds;
    play((all) => (cue === 'warning' ? all.warning : all.tick));
  }, [remainingSeconds, enabled]);
}

/** Dłuższy sygnał w chwili, gdy przerwa się kończy. */
export function playRestEndSound(): void {
  play((all) => all.final);
}
