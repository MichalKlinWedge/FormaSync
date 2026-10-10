import { connectApi, GarminAuthExpired } from './client';

/**
 * Okrążenia aktywności z Garmin Connect. Lista aktywności podaje tylko sumy, więc bez tego
 * odczytu każdy trening z zegarka miał w bazie jeden odcinek — a z jednego odcinka nie da się
 * wyłuskać najszybszego kilometra, tylko średnią całości.
 *
 * API jest nieudokumentowane, więc odczyt jest podzielony na pobranie i osobne, czyste
 * przeliczenie, które da się sprawdzić testem bez sieci. Brak okrążeń to nie błąd: aktywność
 * nagrana bez okrążeń, trening siłowy i joga nie mają czego dzielić — wtedy zostaje stary
 * zapis jednym odcinkiem.
 */

/** Jedno okrążenie przeliczone na to, co trzyma baza. */
export type Lap = { meters: number; seconds: number; avgHeartRate: number | null };

/** Surowe okrążenie Garmina. Każde pole może zniknąć, więc żadnego nie wymagamy. */
export type GarminLapRow = {
  distance?: number | null;
  duration?: number | null;
  movingDuration?: number | null;
  elapsedDuration?: number | null;
  averageHR?: number | null;
};

/**
 * Garmin pakuje okrążenia pod różne nazwy: bieg i rower dostają `lapDTOs`, pływanie dodaje
 * `lengthDTOs` z pojedynczymi długościami basenu. Zaglądamy pod wszystkie znane klucze.
 */
export type GarminSplitsRow = {
  lapDTOs?: GarminLapRow[] | null;
  lengthDTOs?: GarminLapRow[] | null;
  splits?: GarminLapRow[] | null;
};

const positive = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

function rowsOf(payload: GarminSplitsRow | GarminLapRow[] | null): GarminLapRow[] {
  if (payload === null || payload === undefined) return [];
  if (Array.isArray(payload)) return payload;
  return payload.lapDTOs ?? payload.lengthDTOs ?? payload.splits ?? [];
}

/**
 * Okrążenia z odpowiedzi Garmina. Jedno okrążenie odrzucamy: to po prostu cała aktywność,
 * którą i tak zapisujemy z sum, a drugi taki sam odcinek nic nie wnosi.
 */
export function parseLaps(payload: GarminSplitsRow | GarminLapRow[] | null): Lap[] {
  const laps = rowsOf(payload)
    .map((row) => {
      const heartRate = positive(row.averageHR);
      return {
        meters: positive(row.distance) ?? 0,
        // `duration` to czas okrążenia; pozostałe dwa są zapasem, gdy go nie przysłano.
        seconds: Math.round(
          positive(row.duration) ?? positive(row.movingDuration) ?? positive(row.elapsedDuration) ?? 0,
        ),
        avgHeartRate: heartRate === null ? null : Math.round(heartRate),
      };
    })
    .filter((lap) => lap.meters > 0 || lap.seconds > 0);

  return laps.length > 1 ? laps : [];
}

/**
 * Czy okrążenia opisują ten sam trening, co jego podsumowanie. Rozjechany podział zmieniłby
 * dystans treningu w historii, więc w razie niezgody wolimy zostać przy sumach z listy
 * aktywności. Dwa procent luzu zostawiamy na zaokrąglenia, bo Garmin podaje metry z ułamkami.
 */
export function lapsMatchTotal(laps: Lap[], meters: number | null): boolean {
  if (laps.length === 0) return false;
  if (meters === null || meters <= 0) return true;
  const sum = laps.reduce((total, lap) => total + lap.meters, 0);
  return Math.abs(sum - meters) <= meters * 0.02;
}

/**
 * Okrążenia krótsze od tego pomijamy przy sprawdzaniu tempa. Na końcu aktywności zostaje zwykle
 * kilkudziesięciometrowa resztka, której czas bywa zaokrąglony do sekundy — liczona jako tempo
 * wychodzi absurdalnie szybka, a na żaden rekord i tak nie ma wpływu.
 */
const MIN_CHECKED_METERS = 100;

/**
 * Czy zestaw okrążeń da się uznać za wiarygodny podział treningu.
 *
 * Dwie rzeczy go dyskwalifikują. Pierwsza to okrążenie z dystansem, ale **bez czasu**: rekordy
 * sumują metry i sekundy osobno, więc takie okrążenie dokłada dystans bez czasu i z treningu
 * biegniętego po 5:00/km robi rekord 1:40/km. To zdradliwszy przypadek od zwykłej usterki, bo
 * suma dystansów zostaje poprawna i porównanie z podsumowaniem aktywności nic nie zauważa.
 *
 * Druga to tempo nie do utrzymania przez człowieka — zgubiony sygnał albo ucięty pomiar.
 *
 * W obu wypadkach odrzucamy cały podział i zostajemy przy sumach z listy aktywności: lepiej mieć
 * średnią całego treningu niż rekord z usterki.
 */
export function lapsPlausible(laps: Lap[], fastestPlausiblePace: number): boolean {
  return !laps.some((lap) => {
    if (lap.meters <= 0) return false;
    // Dystans bez czasu dyskwalifikuje niezależnie od długości okrążenia.
    if (lap.seconds <= 0) return true;
    return lap.meters >= MIN_CHECKED_METERS && (lap.seconds * 1000) / lap.meters < fastestPlausiblePace;
  });
}

/** Numer aktywności ze ścieżki adresu; `null`, gdy identyfikator nie pochodzi z Garmina. */
export function activityNumber(recordId: string): string | null {
  return /^garmin:(\d+)$/.exec(recordId)?.[1] ?? null;
}

/**
 * Oba znane adresy okrążeń. API nie jest dokumentowane i Garmin przestawiał już te ścieżki,
 * więc po nieudanej pierwszej próbujemy drugiej, zamiast milcząco zwracać pustą listę.
 */
const SPLIT_PATHS = ['splits', 'typedsplits'];

/**
 * Okrążenia aktywności. Odmowę Garmina (aktywność bez okrążeń zwraca 404) zjadamy — trening
 * zapisze się wtedy jednym odcinkiem, jak dotąd. Wygasłe połączenie przepuszczamy dalej, bo
 * z nim nie zadziała już nic i ekran ma o tym powiedzieć.
 */
export async function fetchGarminLaps(recordId: string): Promise<Lap[]> {
  const id = activityNumber(recordId);
  if (id === null) return [];

  for (const path of SPLIT_PATHS) {
    try {
      const laps = parseLaps(
        await connectApi<GarminSplitsRow>(`/activity-service/activity/${id}/${path}`),
      );
      if (laps.length > 0) return laps;
    } catch (error) {
      if (error instanceof GarminAuthExpired) throw error;
    }
  }
  return [];
}
