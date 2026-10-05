import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useEffect, useRef } from 'react';

/**
 * Odliczanie końca przerwy słychać, a nie tylko widać. Telefon leży zwykle ekranem w dół
 * albo na ławce obok — ostatnie pięć sekund trzeba usłyszeć, żeby zdążyć wrócić pod sztangę.
 */

const COUNTDOWN_FROM = 5;

// Odtwarzacze tworzymy raz na proces: zakładanie ich przy każdym piknięciu dawałoby
// opóźnienie rzędu dziesiątek milisekund, a przy odliczaniu sekund to słychać.
let tick: ReturnType<typeof createAudioPlayer> | null = null;
let final: ReturnType<typeof createAudioPlayer> | null = null;
let audioModeSet = false;

function players() {
  if (!tick) tick = createAudioPlayer(require('../../../assets/sounds/beep.wav'));
  if (!final) final = createAudioPlayer(require('../../../assets/sounds/beep-end.wav'));
  if (!audioModeSet) {
    audioModeSet = true;
    // Pikanie nie ma uciszać muzyki, z którą się trenuje — ma się w nią wmieszać.
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
  }
  return { tick, final };
}

function play(player: ReturnType<typeof createAudioPlayer>) {
  try {
    player.seekTo(0);
    player.play();
  } catch {
    // Brak dźwięku nie może przerwać treningu — odliczanie widać też na ekranie.
  }
}

/**
 * Pika w ostatnich pięciu sekundach przerwy, raz na sekundę, a na zero dłuższym sygnałem.
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
    if (remainingSeconds > COUNTDOWN_FROM || remainingSeconds < 1) return;
    if (lastPlayed.current === remainingSeconds) return;
    lastPlayed.current = remainingSeconds;
    play(players().tick);
  }, [remainingSeconds, enabled]);
}

/** Dłuższy sygnał w chwili, gdy przerwa się kończy. */
export function playRestEndSound(): void {
  play(players().final);
}
