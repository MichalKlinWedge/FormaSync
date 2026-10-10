import type { Sport } from '@/db/schema';

/**
 * Rekordy wytrzymałościowe. Rekordem jest tu czas na konkretnym dystansie, a nie tempo —
 * „5 km w 22:40” mówi to samo bieżącemu i rowerzyście, a pływakowi nie trzeba przeliczać
 * sekund na kilometr, których nikt w basenie nie liczy.
 *
 * Najlepszy czas szukamy wewnątrz treningu, nie w jego podsumowaniu: pięć kilometrów w środku
 * dwudziestki bywa szybsze niż cała samodzielna „piątka”, a średnia z całości rozmywa je
 * rozgrzewką i schłodzeniem. Gdzie odcinków nie ma — a tak przychodzą treningi wczytane
 * z zegarka, bo lista aktywności Garmina podaje tylko sumy — zostaje średnia całego treningu.
 * Przy rekordzie piszemy wtedy, skąd się wziął, żeby fragment nie udawał pomiaru z mety.
 */

/** Jeden pokonany odcinek treningu, w kolejności chronologicznej. */
export type Split = { meters: number; seconds: number };

/** Skąd pochodzi czas rekordu: z fragmentu treningu czy ze średniej całego treningu. */
export type RecordSource = 'SPLIT' | 'WORKOUT';

export const SOURCE_LABELS: Record<RecordSource, string> = {
  SPLIT: 'fragment treningu',
  WORKOUT: 'średnia treningu',
};

/** Trening w postaci, jakiej potrzebują rekordy. `EnduranceWorkout` spełnia ten kształt. */
export type RecordWorkout = {
  sessionId: number;
  title: string;
  startTime: string;
  meters: number;
  seconds: number;
  pace: number | null;
  workPace: number | null;
  splits: Split[];
};

/** Najlepszy czas na dystansie wraz z treningiem, w którym padł. */
export type EffortRecord = {
  meters: number;
  seconds: number;
  source: RecordSource;
  sessionId: number;
  title: string;
  startTime: string;
};

/** Rekord bez dystansu odniesienia: najdłuższy trening, najlepsze tempo. */
export type Feat = { value: number; sessionId: number; title: string; startTime: string };

export type SportRecords = {
  efforts: EffortRecord[];
  longestDistance: Feat | null;
  longestTime: Feat | null;
  bestPace: Feat | null;
  /** Ile treningów odpadło z powodu tempa nie do utrzymania przez człowieka. */
  skipped: number;
};

/**
 * Dystanse, na których liczymy rekordy — osobne dla każdej dyscypliny, bo „10 km” to dla biegacza
 * poważny start, a dla rowerzysty rozgrzewka. Siła i „Różne” nie mierzą się dystansem: taniec
 * ani tenis nie mają kilometrów, więc zostaje im rekord czasu.
 */
/**
 * Najszybsze tempo, jakie człowiek jest w stanie utrzymać — w sekundach na kilometr. Wszystko
 * poniżej jest usterką zapisu, nie rekordem: zgubiony sygnał GPS, aktywność dopisana ręcznie
 * w Garminie, ucięte okrążenie albo bieżnia, która podała dystans bez czasu.
 *
 * Bez tego progu jeden taki trening zostawał rekordem na zawsze, bo rekord bierze minimum
 * z całej historii — a przy „1 km w 0:39” cały plan liczyłby tempa od prędkości samochodu.
 * Rekord świata na kilometrze to 2:11, więc dwie minuty zostawiają zapas i dla biegacza,
 * i dla sprintera na krótkim odcinku.
 */
export const FASTEST_PLAUSIBLE_PACE: Record<Sport, number> = {
  STRENGTH: 0,
  RUNNING: 120,
  // Sześćdziesiąt sekund na kilometr to 60 km/h; na rowerze zjazd bywa szybszy, więc zapas
  // większy — ale nie na tyle, żeby przejazd samochodem uszedł za rekord.
  CYCLING: 45,
  // Sto metrów stylem dowolnym poniżej 40 sekund to już nie pływanie, tylko pomyłka pomiaru.
  SWIMMING: 400,
  OTHER: 60,
};

export const RECORD_DISTANCES: Record<Sport, number[]> = {
  STRENGTH: [],
  RUNNING: [1000, 5000, 10000, 21097],
  CYCLING: [10000, 20000, 40000, 100000],
  SWIMMING: [100, 400, 1000, 1500],
  OTHER: [],
};

/**
 * Ile razy dystans rekordu może obejmować okno, zanim przestaniemy je wydłużać. Dalej tempo jest
 * już średnią z kawałka, którego do pokonania dystansu nie było potrzeba.
 */
const WINDOW_SPAN = 3;

/**
 * Odcinek z dystansem, ale bez zmierzonego czasu. Taki wiersz zostaje, gdy zegarek podał
 * okrążenie bez czasu albo gdy odcinek zatwierdzono bez pomiaru — i jest groźniejszy od zwykłego
 * braku danych, bo rekord sumuje metry i sekundy osobno. Wpuszczony do okna dokładał metry bez
 * sekund i z treningu po 5:00/km robił rekord 1:40/km.
 */
const untrusted = (split: Split): boolean => split.meters > 0 && split.seconds <= 0;

/**
 * Najszybszy fragment treningu o długości co najmniej `target`. Przeglądamy każde spójne okno
 * odcinków, bo listy są krótkie — kilkadziesiąt okrążeń na trening — a przybliżenie oknem
 * najkrótszym z możliwych potrafiło podać czas wolniejszy od prawdziwie najszybszego.
 *
 * Odcinki bez dystansu (przerwy) wchodzą do okna razem z pozostałymi: dokładają sekundy, nie
 * dokładając metrów, i słusznie psują tempo. Przebiegnięcie piątki z postojem w środku nie jest
 * rekordem na piątce. Odcinek z dystansem bez czasu okno przerywa — patrz `untrusted`.
 */
export function bestEffort(
  splits: Split[],
  target: number,
  fastestPlausiblePace = 0,
): { seconds: number; source: RecordSource } | null {
  let best: { seconds: number; source: RecordSource } | null = null;

  for (let from = 0; from < splits.length; from += 1) {
    if (untrusted(splits[from])) continue;
    let meters = 0;
    let seconds = 0;

    for (let to = from; to < splits.length; to += 1) {
      // Odcinek z dystansem, ale bez czasu, przerywa okno. Gdyby do niego wejść, dołożyłby
      // metry bez sekund i rekord wyszedłby tyle razy szybszy, ile tego dystansu brakuje czasu.
      if (untrusted(splits[to])) break;

      meters += splits[to].meters;
      seconds += splits[to].seconds;
      if (meters < target || seconds <= 0) continue;

      // Okno prawie nigdy nie kończy się dokładnie na rekordowym dystansie, więc czas skracamy
      // proporcjonalnie. To szacunek z tempa tego fragmentu, a nie odczyt z linii mety.
      const scaled = Math.round((seconds * target) / meters);
      if ((scaled * 1000) / target >= fastestPlausiblePace && (best === null || scaled < best.seconds)) {
        // Okno objęło cały trening, więc nie ma w nim żadnego wyróżnionego fragmentu — to po
        // prostu średnia całości, i tak ją podpisujemy.
        const source: RecordSource = to - from + 1 < splits.length ? 'SPLIT' : 'WORKOUT';
        best = { seconds: scaled, source };
      }

      // Okno dłuższe niż trzykrotność dystansu nie ma już jak być najszybsze: jego tempo jest
      // średnią, a krótsze okno w środku zostało sprawdzone osobno.
      if (meters >= target * WINDOW_SPAN) break;
    }
  }

  return best;
}

function bestBy(
  workouts: RecordWorkout[],
  pick: (workout: RecordWorkout) => number | null,
  mode: 'max' | 'min',
  floor = 0,
): Feat | null {
  let best: Feat | null = null;
  for (const workout of workouts) {
    const value = pick(workout);
    if (value === null || value <= 0 || value < floor) continue;
    if (best !== null && (mode === 'max' ? value <= best.value : value >= best.value)) continue;
    best = {
      value,
      sessionId: workout.sessionId,
      title: workout.title,
      startTime: workout.startTime,
    };
  }
  return best;
}

/** Rekordy dyscypliny z całej historii. Dystans bez ani jednego pokonania wypada z listy. */
export function sportRecords(workouts: RecordWorkout[], sport: Sport): SportRecords {
  const efforts: EffortRecord[] = [];

  const fastest = FASTEST_PLAUSIBLE_PACE[sport];
  // Treningi, których zapis nie daje się czytać jako rekord. Liczymy je, bo bez tej liczby
  // zniknięcie rekordu wyglądałoby jak zgubienie go.
  const suspect = new Set(
    workouts
      .filter((workout) => workout.splits.some(untrusted))
      .map((workout) => workout.sessionId),
  );

  for (const target of RECORD_DISTANCES[sport]) {
    let best: EffortRecord | null = null;
    for (const workout of workouts) {
      const effort = bestEffort(workout.splits, target, fastest);
      // Trening, który na tym dystansie coś pokazuje, ale dopiero po zdjęciu progu tempa,
      // też ma zepsuty zapis.
      if (effort === null) {
        if (bestEffort(workout.splits, target) !== null) suspect.add(workout.sessionId);
        continue;
      }
      if (best !== null && effort.seconds >= best.seconds) continue;
      best = {
        meters: target,
        seconds: effort.seconds,
        source: effort.source,
        sessionId: workout.sessionId,
        title: workout.title,
        startTime: workout.startTime,
      };
    }
    if (best !== null) efforts.push(best);
  }

  return {
    efforts,
    longestDistance: bestBy(workouts, (workout) => workout.meters, 'max'),
    longestTime: bestBy(workouts, (workout) => workout.seconds, 'max'),
    // Tempo z odcinków pracy, tak jak w podsumowaniu: tempo całości zaniża rozgrzewka.
    bestPace: bestBy(workouts, (workout) => workout.workPace ?? workout.pace, 'min', fastest),
    skipped: suspect.size,
  };
}
