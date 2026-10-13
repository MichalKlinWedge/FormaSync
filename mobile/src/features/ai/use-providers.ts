import { useEffect, useState } from 'react';

import type { Provider } from './providers';
import { configuredProviders, defaultProvider } from './tokens';

/**
 * Który dostawca odpowie na to zapytanie.
 *
 * Zaczynamy od domyślnego z ustawień, ale klucze leżą w bezpiecznym magazynie telefonu i czyta się
 * je asynchronicznie — więc dopiero po sprawdzeniu wiadomo, czy ten domyślny ma czym zapytać.
 * Jeśli nie ma, bierzemy pierwszego, który ma: ekran z jednym skonfigurowanym dostawcą nie powinien
 * odmawiać dlatego, że w ustawieniach stoi inny.
 */
export function useAiProvider(): {
  provider: Provider;
  setProvider: (provider: Provider) => void;
  /** Dostawcy z wklejonym kluczem; pusta lista znaczy też „jeszcze nie sprawdzono”. */
  configured: Provider[];
} {
  const [provider, setProvider] = useState<Provider>(() => defaultProvider());
  const [configured, setConfigured] = useState<Provider[]>([]);

  useEffect(() => {
    let alive = true;
    void configuredProviders().then((found) => {
      if (!alive) return;
      setConfigured(found);
      setProvider((current) =>
        found.length === 0 || found.includes(current) ? current : found[0],
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  return { provider, setProvider, configured };
}
