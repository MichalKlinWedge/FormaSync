import { useEffect, useRef } from 'react';

/**
 * Odliczanie końca przerwy słychać, a nie tylko widać. Telefon leży zwykle ekranem w dół
 * albo na ławce obok — ostatnie pięć sekund trzeba usłyszeć, żeby zdążyć wrócić pod sztangę.
 *
 * Moduł dźwięku wczytujemy leniwie i w osłonie. Aktualizacja OTA potrafi wyprzedzić wgranie
 * nowej paczki, a wtedy modułu natywnego jeszcze nie ma; zwykły import wywróciłby wtedy cały
 * ekran trwającego treningu — czyli odebrałby możliwość jego zatrzymania. Brak dźwięku jest
 * akceptowalny, brak ekranu nie jest.
 */

const COUNTDOWN_FROM = 5;

type Player = { seekTo: (seconds: number) => void; play: () => void };
type AudioModule = {
  createAudioPlayer: (source: unknown) => Player;
  setAudioModeAsync: (mode: Record<string, boolean>) => Promise<void>;
};

// Odtwarzacze zakładamy raz na proces: tworzenie ich przy każdym piknięciu dawałoby
// opóźnienie rzędu dziesiątek milisekund, a przy odliczaniu sekund to słychać.
let players: { tick: Player; final: Player } | null = null;
let unavailable = false;

function sounds(): { tick: Player; final: Player } | null {
  if (players || unavailable) return players;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('expo-audio') as AudioModule;
    players = {
      tick: audio.createAudioPlayer(require('../../../assets/sounds/beep.wav')),
      final: audio.createAudioPlayer(require('../../../assets/sounds/beep-end.wav')),
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

function play(pick: (all: { tick: Player; final: Player }) => Player): void {
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
 * Pika w ostatnich pięciu sekundach przerwy, raz na sekundę. `remainingSeconds` to null,
 * gdy przerwa nie trwa; pominięcie przerwy nie pika.
 */
export function useRestCountdownSound(remainingSeconds: number | null, enabled = true): void {
  // Pamiętamy ostatnią odegraną sekundę, żeby przerysowanie ekranu nie piknęło drugi raz.
  const lastPlayed = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || remainingSeconds === null) {
      lastPlayed.current = null;
      return;
    }
    if (remainingSeconds > COUNTDOWN_FROM || remainingSeconds < 1) return;
    if (lastPlayed.current === remainingSeconds) return;
    lastPlayed.current = remainingSeconds;
    play((all) => all.tick);
  }, [remainingSeconds, enabled]);
}

/** Dłuższy sygnał w chwili, gdy przerwa się kończy. */
export function playRestEndSound(): void {
  play((all) => all.final);
}
