import type { DifficultyLevel, TrackingType } from './schema';

// Dane startowe: słowniki, katalog ćwiczeń i wbudowane szablony.
// Zmiana zawartości wymaga podbicia SEED_VERSION (seed.ts dograje brakujące rekordy).

export const SEED_VERSION = 1;

export const seedCategories: { name: string; description: string }[] = [
  { name: 'Klatka piersiowa', description: 'Mięsień piersiowy większy i mniejszy' },
  { name: 'Plecy', description: 'Najszerszy grzbietu, czworoboczny, równoległoboczne, prostowniki' },
  { name: 'Barki', description: 'Aktony przedni, boczny i tylny mięśnia naramiennego' },
  { name: 'Biceps', description: 'Dwugłowy ramienia i ramienny' },
  { name: 'Triceps', description: 'Trójgłowy ramienia' },
  { name: 'Przedramiona', description: 'Zginacze i prostowniki nadgarstka, chwyt' },
  { name: 'Czworogłowe uda', description: 'Przód uda' },
  { name: 'Dwugłowe uda', description: 'Tył uda' },
  { name: 'Pośladki', description: 'Pośladkowy wielki, średni i mały' },
  { name: 'Łydki', description: 'Brzuchaty i płaszczkowaty łydki' },
  { name: 'Brzuch i core', description: 'Prosty i skośne brzucha, poprzeczny, stabilizacja tułowia' },
];

export const seedEquipment: string[] = [
  'Sztanga',
  'Hantle',
  'Kettlebell',
  'Maszyna',
  'Wyciąg',
  'Drążek',
  'Poręcze',
  'Masa ciała',
  'Guma oporowa',
];

export type SeedExercise = {
  name: string;
  category: string;
  secondary?: string[];
  equipment: string;
  difficulty: DifficultyLevel;
  tracking?: TrackingType;
  instructions: string[];
  technique?: string;
  garminCategory?: string;
};

export const seedExercises: SeedExercise[] = [
  // Klatka piersiowa
  {
    name: 'Wyciskanie sztangi na ławce płaskiej',
    category: 'Klatka piersiowa',
    secondary: ['Triceps', 'Barki'],
    equipment: 'Sztanga',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Połóż się na ławce, oczy na wysokości sztangi.',
      'Ściągnij łopatki i lekko wygnij plecy, stopy pewnie na podłodze.',
      'Chwyć sztangę nieco szerzej niż barki i zdejmij ją ze stojaków.',
      'Opuść sztangę kontrolowanie do dolnej części klatki.',
      'Wypchnij sztangę do góry do wyprostu łokci.',
    ],
    technique: 'Łokcie ok. 45–70° od tułowia. Nie odbijaj sztangi od klatki.',
    garminCategory: 'BENCH_PRESS',
  },
  {
    name: 'Wyciskanie hantli na ławce skośnej',
    category: 'Klatka piersiowa',
    secondary: ['Barki', 'Triceps'],
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Ustaw ławkę pod kątem 30–45°.',
      'Usiądź z hantlami na udach, połóż się i unieś je nad klatkę.',
      'Opuść hantle do boków klatki, łokcie lekko pod tułowiem.',
      'Wypchnij hantle do góry, zbliżając je nad klatką.',
    ],
    garminCategory: 'BENCH_PRESS',
  },
  {
    name: 'Rozpiętki z hantlami',
    category: 'Klatka piersiowa',
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Połóż się na ławce płaskiej z hantlami nad klatką, dłonie do siebie.',
      'Z lekko ugiętymi łokciami opuść hantle łukiem na boki.',
      'Zatrzymaj ruch przy uczuciu rozciągnięcia klatki.',
      'Wróć tym samym łukiem do pozycji wyjściowej.',
    ],
    garminCategory: 'FLYE',
  },
  {
    name: 'Pompki',
    category: 'Klatka piersiowa',
    secondary: ['Triceps', 'Barki', 'Brzuch i core'],
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    instructions: [
      'Oprzyj dłonie nieco szerzej niż barki, ciało w linii prostej.',
      'Opuść klatkę do podłogi, łokcie ok. 45° od tułowia.',
      'Wypchnij się do wyprostu ramion.',
    ],
    technique: 'Napięty brzuch i pośladki — biodra nie opadają.',
    garminCategory: 'PUSH_UP',
  },
  {
    name: 'Pompki na poręczach',
    category: 'Klatka piersiowa',
    secondary: ['Triceps', 'Barki'],
    equipment: 'Poręcze',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Wejdź na poręcze na wyprostowanych ramionach.',
      'Pochyl lekko tułów do przodu i opuść się, uginając łokcie.',
      'Zejdź do ok. 90° w łokciach i wypchnij się do góry.',
    ],
    garminCategory: 'TRICEPS_EXTENSION',
  },
  {
    name: 'Rozpiętki na wyciągu (brama)',
    category: 'Klatka piersiowa',
    equipment: 'Wyciąg',
    difficulty: 'BEGINNER',
    instructions: [
      'Ustaw wyciągi na wysokości barków, stań w wykroku pośrodku.',
      'Z lekko ugiętymi łokciami przyciągnij uchwyty łukiem przed siebie.',
      'Kontrolowanie wróć do rozciągnięcia.',
    ],
    garminCategory: 'FLYE',
  },

  // Plecy
  {
    name: 'Martwy ciąg',
    category: 'Plecy',
    secondary: ['Dwugłowe uda', 'Pośladki', 'Przedramiona'],
    equipment: 'Sztanga',
    difficulty: 'ADVANCED',
    instructions: [
      'Stań na szerokość bioder, sztanga nad środkiem stopy.',
      'Chwyć sztangę tuż poza kolanami, plecy proste, klatka do przodu.',
      'Napnij plecy i brzuch, „wypchnij podłogę” nogami.',
      'Prowadź sztangę blisko ciała do pełnego wyprostu bioder.',
      'Opuść sztangę tą samą drogą, zaczynając od cofnięcia bioder.',
    ],
    technique: 'Neutralny kręgosłup przez cały ruch. Nie przeprostowuj w górze.',
    garminCategory: 'DEADLIFT',
  },
  {
    name: 'Wiosłowanie sztangą w opadzie',
    category: 'Plecy',
    secondary: ['Biceps'],
    equipment: 'Sztanga',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Chwyć sztangę nachwytem, pochyl tułów do ok. 45°, kolana lekko ugięte.',
      'Przyciągnij sztangę do dolnej części brzucha, ściągając łopatki.',
      'Opuść sztangę kontrolowanie do wyprostu ramion.',
    ],
    garminCategory: 'ROW',
  },
  {
    name: 'Wiosłowanie hantlem jednorącz',
    category: 'Plecy',
    secondary: ['Biceps'],
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Oprzyj kolano i dłoń o ławkę, plecy równolegle do podłogi.',
      'Przyciągnij hantel do biodra, łokieć blisko tułowia.',
      'Opuść hantel do pełnego rozciągnięcia.',
    ],
    garminCategory: 'ROW',
  },
  {
    name: 'Podciąganie na drążku',
    category: 'Plecy',
    secondary: ['Biceps', 'Przedramiona'],
    equipment: 'Drążek',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Zawiś na drążku nachwytem, dłonie nieco szerzej niż barki.',
      'Ściągnij łopatki w dół i podciągnij się, aż broda minie drążek.',
      'Opuść się kontrolowanie do pełnego zwisu.',
    ],
    garminCategory: 'PULL_UP',
  },
  {
    name: 'Ściąganie drążka wyciągu górnego',
    category: 'Plecy',
    secondary: ['Biceps'],
    equipment: 'Wyciąg',
    difficulty: 'BEGINNER',
    instructions: [
      'Usiądź, zablokuj uda pod wałkami, chwyć drążek szeroko.',
      'Ściągnij drążek do górnej części klatki, prowadząc łokcie w dół.',
      'Powoli wróć do wyprostu ramion.',
    ],
    garminCategory: 'PULL_UP',
  },
  {
    name: 'Wiosłowanie na wyciągu dolnym siedząc',
    category: 'Plecy',
    secondary: ['Biceps'],
    equipment: 'Wyciąg',
    difficulty: 'BEGINNER',
    instructions: [
      'Usiądź, oprzyj stopy, chwyć uchwyt, plecy proste.',
      'Przyciągnij uchwyt do brzucha, ściągając łopatki.',
      'Wróć do wyprostu ramion bez zaokrąglania pleców.',
    ],
    garminCategory: 'ROW',
  },
  {
    name: 'Superman',
    category: 'Plecy',
    secondary: ['Pośladki'],
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    instructions: [
      'Połóż się na brzuchu z rękami wyciągniętymi przed siebie.',
      'Jednocześnie unieś ręce, klatkę i nogi nad podłogę.',
      'Przytrzymaj 1–2 s i opuść.',
    ],
    garminCategory: 'HYPEREXTENSION',
  },

  // Barki
  {
    name: 'Wyciskanie żołnierskie (OHP)',
    category: 'Barki',
    secondary: ['Triceps', 'Brzuch i core'],
    equipment: 'Sztanga',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Stań na szerokość bioder, sztanga na wysokości obojczyków.',
      'Napnij pośladki i brzuch.',
      'Wypchnij sztangę pionowo nad głowę, przesuwając głowę lekko w tył.',
      'Opuść sztangę kontrolowanie na obojczyki.',
    ],
    garminCategory: 'SHOULDER_PRESS',
  },
  {
    name: 'Wyciskanie hantli nad głowę siedząc',
    category: 'Barki',
    secondary: ['Triceps'],
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Usiądź na ławce z oparciem, hantle na wysokości barków.',
      'Wypchnij hantle nad głowę do prawie pełnego wyprostu.',
      'Opuść hantle do wysokości uszu.',
    ],
    garminCategory: 'SHOULDER_PRESS',
  },
  {
    name: 'Unoszenie hantli bokiem',
    category: 'Barki',
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań prosto, hantle przy udach, łokcie lekko ugięte.',
      'Unieś hantle bokiem do wysokości barków.',
      'Powoli opuść.',
    ],
    technique: 'Prowadź ruch łokciem, nie nadgarstkiem. Bez bujania tułowiem.',
    garminCategory: 'LATERAL_RAISE',
  },
  {
    name: 'Face pull na wyciągu',
    category: 'Barki',
    secondary: ['Plecy'],
    equipment: 'Wyciąg',
    difficulty: 'BEGINNER',
    instructions: [
      'Ustaw linkę na wysokości twarzy, chwyć końce liny.',
      'Przyciągnij linę do twarzy, rozchylając jej końce i łokcie wysoko.',
      'Wróć powoli do wyprostu ramion.',
    ],
    garminCategory: 'ROW',
  },

  // Biceps / triceps / przedramiona
  {
    name: 'Uginanie ramion ze sztangą',
    category: 'Biceps',
    secondary: ['Przedramiona'],
    equipment: 'Sztanga',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań prosto, sztanga podchwytem na szerokość barków.',
      'Ugnij ramiona, łokcie przy tułowiu.',
      'Opuść sztangę do pełnego wyprostu.',
    ],
    garminCategory: 'CURL',
  },
  {
    name: 'Uginanie ramion z hantlami (młotkowe)',
    category: 'Biceps',
    secondary: ['Przedramiona'],
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań z hantlami chwytem neutralnym (kciuki do przodu).',
      'Ugnij ramiona naprzemiennie lub jednocześnie.',
      'Opuść hantle kontrolowanie.',
    ],
    garminCategory: 'CURL',
  },
  {
    name: 'Prostowanie ramion na wyciągu',
    category: 'Triceps',
    equipment: 'Wyciąg',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań przed wyciągiem górnym, chwyć drążek lub linę.',
      'Łokcie przy tułowiu — wyprostuj ramiona w dół.',
      'Wróć do ok. 90° w łokciach.',
    ],
    garminCategory: 'TRICEPS_EXTENSION',
  },
  {
    name: 'Wyciskanie francuskie hantlem',
    category: 'Triceps',
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Usiądź, trzymaj hantel oburącz nad głową.',
      'Opuść hantel za głowę, uginając łokcie.',
      'Wyprostuj ramiona do góry.',
    ],
    garminCategory: 'TRICEPS_EXTENSION',
  },
  {
    name: 'Pompki na krześle (dipy)',
    category: 'Triceps',
    secondary: ['Klatka piersiowa'],
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    instructions: [
      'Oprzyj dłonie o krawędź stabilnego krzesła za sobą.',
      'Opuść biodra, uginając łokcie do ok. 90°.',
      'Wypchnij się do wyprostu ramion.',
    ],
    garminCategory: 'TRICEPS_EXTENSION',
  },
  {
    name: 'Spacer farmera',
    category: 'Przedramiona',
    secondary: ['Brzuch i core', 'Plecy'],
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    tracking: 'TIME',
    instructions: [
      'Chwyć ciężkie hantle lub kettlebelle po bokach.',
      'Idź krótkimi krokami z wyprostowaną sylwetką.',
      'Utrzymaj chwyt przez zadany czas.',
    ],
    garminCategory: 'CARRY',
  },

  // Nogi
  {
    name: 'Przysiad ze sztangą',
    category: 'Czworogłowe uda',
    secondary: ['Pośladki', 'Dwugłowe uda', 'Brzuch i core'],
    equipment: 'Sztanga',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Ułóż sztangę na górnej części pleców, stopy na szerokość barków.',
      'Weź wdech, napnij brzuch.',
      'Zejdź w dół, cofając biodra i uginając kolana, do co najmniej równoległości ud.',
      'Wstań, wypychając podłogę całą stopą.',
    ],
    technique: 'Kolana podążają za palcami stóp. Pięty nie odrywają się od podłogi.',
    garminCategory: 'SQUAT',
  },
  {
    name: 'Przysiad goblet',
    category: 'Czworogłowe uda',
    secondary: ['Pośladki'],
    equipment: 'Kettlebell',
    difficulty: 'BEGINNER',
    instructions: [
      'Trzymaj kettlebell przy klatce oburącz.',
      'Zejdź do głębokiego przysiadu z wyprostowanymi plecami.',
      'Wstań do pełnego wyprostu.',
    ],
    garminCategory: 'SQUAT',
  },
  {
    name: 'Przysiad z masą ciała',
    category: 'Czworogłowe uda',
    secondary: ['Pośladki'],
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań na szerokość barków, ręce przed sobą.',
      'Zejdź w dół, cofając biodra.',
      'Wróć do wyprostu.',
    ],
    garminCategory: 'SQUAT',
  },
  {
    name: 'Wypychanie nogami na maszynie',
    category: 'Czworogłowe uda',
    secondary: ['Pośladki'],
    equipment: 'Maszyna',
    difficulty: 'BEGINNER',
    instructions: [
      'Usiądź w maszynie, stopy na platformie na szerokość bioder.',
      'Zwolnij blokadę i opuść platformę, uginając kolana do ok. 90°.',
      'Wypchnij platformę bez blokowania kolan w górze.',
    ],
    garminCategory: 'SQUAT',
  },
  {
    name: 'Wykroki z hantlami',
    category: 'Czworogłowe uda',
    secondary: ['Pośladki'],
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań z hantlami w dłoniach.',
      'Zrób duży krok w przód i opuść tylne kolano nad podłogę.',
      'Odepchnij się przednią nogą i wróć. Zmień nogę.',
    ],
    garminCategory: 'LUNGE',
  },
  {
    name: 'Wykroki bez obciążenia',
    category: 'Czworogłowe uda',
    secondary: ['Pośladki'],
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań prosto, dłonie na biodrach.',
      'Zrób krok w przód i opuść tylne kolano nad podłogę.',
      'Wróć do pozycji wyjściowej, zmień nogę.',
    ],
    garminCategory: 'LUNGE',
  },
  {
    name: 'Martwy ciąg rumuński',
    category: 'Dwugłowe uda',
    secondary: ['Pośladki', 'Plecy'],
    equipment: 'Sztanga',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Stań ze sztangą w dłoniach, kolana lekko ugięte.',
      'Cofaj biodra, prowadząc sztangę wzdłuż ud aż do rozciągnięcia tyłu uda.',
      'Wróć do wyprostu, napinając pośladki.',
    ],
    garminCategory: 'DEADLIFT',
  },
  {
    name: 'Uginanie nóg na maszynie',
    category: 'Dwugłowe uda',
    equipment: 'Maszyna',
    difficulty: 'BEGINNER',
    instructions: [
      'Połóż się lub usiądź w maszynie, wałek nad piętami.',
      'Ugnij nogi, przyciągając wałek do pośladków.',
      'Powoli wyprostuj nogi.',
    ],
    garminCategory: 'LEG_CURL',
  },
  {
    name: 'Hip thrust ze sztangą',
    category: 'Pośladki',
    secondary: ['Dwugłowe uda'],
    equipment: 'Sztanga',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Oprzyj łopatki o ławkę, sztanga na biodrach (z podkładką).',
      'Wypchnij biodra do góry do linii kolana–bark.',
      'Zatrzymaj na chwilę i opuść biodra.',
    ],
    garminCategory: 'HIP_RAISE',
  },
  {
    name: 'Mostek biodrowy',
    category: 'Pośladki',
    secondary: ['Dwugłowe uda'],
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    instructions: [
      'Połóż się na plecach, stopy blisko pośladków.',
      'Unieś biodra, napinając pośladki.',
      'Opuść biodra kontrolowanie.',
    ],
    garminCategory: 'HIP_RAISE',
  },
  {
    name: 'Kettlebell swing',
    category: 'Pośladki',
    secondary: ['Dwugłowe uda', 'Plecy', 'Brzuch i core'],
    equipment: 'Kettlebell',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Stań szerzej niż biodra, kettlebell przed sobą.',
      'Przenieś kettlebell między nogi, cofając biodra.',
      'Dynamicznie wyprostuj biodra, wyrzucając kettlebell do wysokości klatki.',
    ],
    technique: 'Ruch z bioder, nie z ramion.',
    garminCategory: 'HIP_SWING',
  },
  {
    name: 'Wspięcia na palce stojąc',
    category: 'Łydki',
    equipment: 'Maszyna',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań przodostopiem na podwyższeniu.',
      'Opuść pięty jak najniżej.',
      'Wspnij się maksymalnie na palce i zatrzymaj na chwilę.',
    ],
    garminCategory: 'CALF_RAISE',
  },

  // Brzuch i core
  {
    name: 'Plank (deska)',
    category: 'Brzuch i core',
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    tracking: 'TIME',
    instructions: [
      'Oprzyj się na przedramionach i palcach stóp.',
      'Utrzymaj ciało w linii prostej, napnij brzuch i pośladki.',
      'Wytrzymaj zadany czas, oddychając spokojnie.',
    ],
    garminCategory: 'PLANK',
  },
  {
    name: 'Brzuszki (crunch)',
    category: 'Brzuch i core',
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    instructions: [
      'Połóż się na plecach, kolana ugięte, dłonie przy skroniach.',
      'Unieś łopatki nad podłogę, napinając brzuch.',
      'Powoli wróć.',
    ],
    garminCategory: 'CRUNCH',
  },
  {
    name: 'Unoszenie nóg w zwisie',
    category: 'Brzuch i core',
    secondary: ['Przedramiona'],
    equipment: 'Drążek',
    difficulty: 'ADVANCED',
    instructions: [
      'Zawiś na drążku.',
      'Unieś nogi (proste lub ugięte) do poziomu lub wyżej, bez bujania.',
      'Opuść kontrolowanie.',
    ],
    garminCategory: 'LEG_RAISE',
  },
  {
    name: 'Martwy robak (dead bug)',
    category: 'Brzuch i core',
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    instructions: [
      'Połóż się na plecach, ręce w górę, kolana ugięte nad biodrami.',
      'Opuść przeciwną rękę i nogę nad podłogę, lędźwie przyklejone do podłoża.',
      'Wróć i zmień stronę.',
    ],
    garminCategory: 'CORE',
  },
];

export type SeedTemplateExercise = {
  exercise: string;
  sets: number;
  reps?: number;
  durationSeconds?: number;
  rest: number;
};

export type SeedTemplate = {
  title: string;
  description: string;
  exercises: SeedTemplateExercise[];
};

export const seedTemplates: SeedTemplate[] = [
  {
    title: 'FBW — Full Body Workout',
    description: 'Trening całego ciała 2–3× w tygodniu. Dobry start dla początkujących.',
    exercises: [
      { exercise: 'Przysiad ze sztangą', sets: 3, reps: 8, rest: 120 },
      { exercise: 'Wyciskanie sztangi na ławce płaskiej', sets: 3, reps: 8, rest: 120 },
      { exercise: 'Wiosłowanie sztangą w opadzie', sets: 3, reps: 8, rest: 90 },
      { exercise: 'Wyciskanie żołnierskie (OHP)', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Martwy ciąg rumuński', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Plank (deska)', sets: 3, durationSeconds: 45, rest: 60 },
    ],
  },
  {
    title: 'PPL — Push (pchanie)',
    description: 'Dzień 1 z 3 planu Push-Pull-Legs: klatka, barki, triceps.',
    exercises: [
      { exercise: 'Wyciskanie sztangi na ławce płaskiej', sets: 4, reps: 6, rest: 150 },
      { exercise: 'Wyciskanie hantli na ławce skośnej', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Wyciskanie żołnierskie (OHP)', sets: 3, reps: 8, rest: 120 },
      { exercise: 'Unoszenie hantli bokiem', sets: 3, reps: 15, rest: 60 },
      { exercise: 'Prostowanie ramion na wyciągu', sets: 3, reps: 12, rest: 60 },
    ],
  },
  {
    title: 'PPL — Pull (przyciąganie)',
    description: 'Dzień 2 z 3 planu Push-Pull-Legs: plecy, tylne aktony barków, biceps.',
    exercises: [
      { exercise: 'Martwy ciąg', sets: 3, reps: 5, rest: 180 },
      { exercise: 'Podciąganie na drążku', sets: 4, reps: 8, rest: 120 },
      { exercise: 'Wiosłowanie hantlem jednorącz', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Face pull na wyciągu', sets: 3, reps: 15, rest: 60 },
      { exercise: 'Uginanie ramion ze sztangą', sets: 3, reps: 10, rest: 60 },
    ],
  },
  {
    title: 'PPL — Legs (nogi)',
    description: 'Dzień 3 z 3 planu Push-Pull-Legs: nogi, pośladki, łydki.',
    exercises: [
      { exercise: 'Przysiad ze sztangą', sets: 4, reps: 6, rest: 180 },
      { exercise: 'Martwy ciąg rumuński', sets: 3, reps: 8, rest: 120 },
      { exercise: 'Wypychanie nogami na maszynie', sets: 3, reps: 12, rest: 90 },
      { exercise: 'Uginanie nóg na maszynie', sets: 3, reps: 12, rest: 60 },
      { exercise: 'Wspięcia na palce stojąc', sets: 4, reps: 15, rest: 60 },
    ],
  },
  {
    title: 'Trening domowy',
    description: 'Bez sprzętu — wystarczy mata i krzesło.',
    exercises: [
      { exercise: 'Przysiad z masą ciała', sets: 3, reps: 15, rest: 60 },
      { exercise: 'Pompki', sets: 3, reps: 10, rest: 60 },
      { exercise: 'Wykroki bez obciążenia', sets: 3, reps: 12, rest: 60 },
      { exercise: 'Pompki na krześle (dipy)', sets: 3, reps: 10, rest: 60 },
      { exercise: 'Mostek biodrowy', sets: 3, reps: 15, rest: 45 },
      { exercise: 'Superman', sets: 3, reps: 12, rest: 45 },
      { exercise: 'Plank (deska)', sets: 3, durationSeconds: 30, rest: 45 },
    ],
  },
];
