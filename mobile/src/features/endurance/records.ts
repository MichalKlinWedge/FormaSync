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
};

/**
 * Dystanse, na których liczymy rekordy — osobne dla każdej dyscypliny, bo „10 km” to dla biegacza
 * poważny start, a dla rowerzysty rozgrzewka. Siła i „Różne” nie mierzą się dystansem: taniec
 * ani tenis nie mają kilometrów, więc zostaje im rekord czasu.
 */
export const RECORD_DISTANCES: Record<Sport, number[]> = {
  STRENGTH: [],
  RUNNING: [1000, 5000, 10000, 21097],
  CYCLING: [10000, 20000, 40000, 100000],
  SWIMMING: [100, 400, 1000, 1500],
  OTHER: [],
};

/**
 * Najszybszy fragment treningu o długości co najmniej `target`. Okno przesuwamy po odcinkach
 * i trzymamy najkrótsze z możliwych — zostawiony z przodu nadmiarowy odcinek dokładałby do
 * rekordu kawałek, którego do pokonania dystansu wcale nie było potrzeba.
 *
 * Odcinki bez dystansu (przerwy) wchodzą do okna razem z pozostałymi: dokładają sekundy, nie
 * dokładając metrów, i słusznie psują tempo. Przebiegnięcie piątki z postojem w środku nie jest
 * rekordem na piątce.
 */
export function bestEffort(
  splits: Split[],
  target: number,
): { seconds: number; source: RecordSource } | null {
  let best: { seconds: number; source: RecordSource } | null = null;
  let left = 0;
  let meters = 0;
  let seconds = 0;

  for (let right = 0; right < splits.length; right += 1) {
    meters += splits[right].meters;
    seconds += splits[right].seconds;

    while (left < right && meters - splits[left].meters >= target) {
      meters -= splits[left].meters;
      seconds -= splits[left].seconds;
      left += 1;
    }

    if (meters < target || seconds <= 0) continue;

    // Okno prawie nigdy nie kończy się dokładnie na rekordowym dystansie, więc czas skracamy
    // proporcjonalnie. To szacunek z tempa tego fragmentu, a nie odczyt z linii mety.
    const scaled = Math.round((seconds * target) / meters);
    // Okno objęło cały trening, więc nie ma w nim żadnego wyróżnionego fragmentu — to po prostu
    // średnia całości, i tak ją podpisujemy.
    const source: RecordSource = right - left + 1 < splits.length ? 'SPLIT' : 'WORKOUT';
    if (best === null || scaled < best.seconds) best = { seconds: scaled, source };
  }

  return best;
}

function bestBy(
  workouts: RecordWorkout[],
  pick: (workout: RecordWorkout) => number | null,
  mode: 'max' | 'min',
): Feat | null {
  let best: Feat | null = null;
  for (const workout of workouts) {
    const value = pick(workout);
    if (value === null || value <= 0) continue;
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

  for (const target of RECORD_DISTANCES[sport]) {
    let best: EffortRecord | null = null;
    for (const workout of workouts) {
      const effort = bestEffort(workout.splits, target);
      if (effort === null) continue;
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
    bestPace: bestBy(workouts, (workout) => workout.workPace ?? workout.pace, 'min'),
  };
}
