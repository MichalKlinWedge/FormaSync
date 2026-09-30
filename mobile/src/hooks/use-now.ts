import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Bieżący czas odświeżany co sekundę oraz natychmiast po powrocie aplikacji na pierwszy plan —
 * w tle Android wstrzymuje liczniki, więc po powrocie trzeba nadrobić upływ czasu.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, intervalMs);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [intervalMs]);

  return now;
}
