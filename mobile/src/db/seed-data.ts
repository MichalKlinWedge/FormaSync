import type {
  DifficultyLevel,
  DurationType,
  SegmentKind,
  Sport,
  Stroke,
  TargetType,
  TrackingType,
} from './schema';

// Dane startowe: słowniki, katalog ćwiczeń i wbudowane szablony.
// Zmiana zawartości wymaga podbicia SEED_VERSION (seed.ts dograje brakujące rekordy).

export const SEED_VERSION = 5;

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
  'Sztanga łamana',
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
  {
    name: 'Wyciskanie hantli na ławce płaskiej',
    category: 'Klatka piersiowa',
    secondary: ['Triceps', 'Barki'],
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Połóż się na ławce z hantlami nad klatką, nadgarstki nad łokciami.',
      'Ściągnij łopatki, stopy pewnie na podłodze.',
      'Opuść hantle na wysokość klatki, łokcie lekko przy tułowiu.',
      'Wypchnij hantle do góry, nie zderzając ich ze sobą.',
    ],
    technique: 'Większy zakres niż ze sztangą — opuszczaj tylko tam, gdzie bark nie boli.',
    garminCategory: 'BENCH_PRESS',
  },
  {
    name: 'Przenoszenie hantla nad głowę leżąc',
    category: 'Klatka piersiowa',
    secondary: ['Plecy', 'Triceps'],
    equipment: 'Hantle',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Połóż się na ławce, chwyć jeden hantel oburącz nad klatką.',
      'Z lekko ugiętymi łokciami opuść hantel za głowę.',
      'Zatrzymaj się tam, gdzie czujesz rozciąganie klatki, i wróć nad klatkę.',
    ],
    technique: 'Żebra ściągnięte w dół — ruch ma iść z barków, nie z wygięcia lędźwi.',
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
  {
    name: 'Podciąganie podchwytem',
    category: 'Plecy',
    secondary: ['Biceps'],
    equipment: 'Drążek',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Chwyć drążek podchwytem na szerokość barków.',
      'Zwiś z aktywnymi łopatkami, nogi lekko do przodu.',
      'Podciągnij się, prowadząc łokcie do żeber.',
      'Opuść się kontrolowanie do pełnego zwisu.',
    ],
    technique: 'Podchwyt daje więcej bicepsa niż nachwyt — dobry wariant, gdy nachwyt jeszcze nie wychodzi.',
    garminCategory: 'PULL_UP',
  },
  {
    name: 'Wiosłowanie hantlami w opadzie',
    category: 'Plecy',
    secondary: ['Biceps', 'Barki'],
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań w lekkim rozkroku, zegnij biodra do opadu ok. 45°.',
      'Hantle zwisają pod barkami, plecy prosto.',
      'Przyciągnij hantle do żeber, łokcie przy tułowiu.',
      'Opuść je powoli do pełnego wyprostu ramion.',
    ],
    technique: 'Opad trzymaj w biodrach, nie w plecach — tułów nie ma się podnosić z powtórzeniem.',
    garminCategory: 'ROW',
  },
  {
    name: 'Szrugsy ze sztangą',
    category: 'Plecy',
    secondary: ['Przedramiona'],
    equipment: 'Sztanga',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań prosto, sztanga nachwytem przed udami.',
      'Unieś barki prosto do góry, jakbyś wzruszał ramionami.',
      'Zatrzymaj na chwilę i opuść barki do końca.',
    ],
    technique: 'Bez krążenia barkami i bez uginania ramion — ruch jest tylko w górę i w dół.',
    garminCategory: 'SHRUG',
  },
  {
    name: 'Przyciąganie gumy do brzucha siedząc',
    category: 'Plecy',
    secondary: ['Biceps'],
    equipment: 'Guma oporowa',
    difficulty: 'BEGINNER',
    instructions: [
      'Usiądź, zahacz gumę o stopy lub stały punkt na wysokości pasa.',
      'Chwyć końce gumy, wyprostuj plecy.',
      'Przyciągnij ręce do brzucha, ściągając łopatki.',
      'Wróć powoli, aż guma znów napnie plecy.',
    ],
    garminCategory: 'ROW',
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
  {
    name: 'Wyciskanie Arnolda',
    category: 'Barki',
    secondary: ['Triceps', 'Klatka piersiowa'],
    equipment: 'Hantle',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Usiądź na ławce z oparciem, hantle przed barkami podchwytem.',
      'Wyciskając do góry, obróć dłonie na zewnątrz.',
      'Na górze ramiona wyprostowane, dłonie na zewnątrz.',
      'Wróć tą samą drogą, obracając dłonie znów do siebie.',
    ],
    technique: 'Obrót rób w trakcie ruchu, nie przed nim — inaczej bark pracuje w złej pozycji.',
    garminCategory: 'SHOULDER_PRESS',
  },
  {
    name: 'Unoszenie hantli w opadzie',
    category: 'Barki',
    secondary: ['Plecy'],
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Zegnij biodra do opadu, hantle zwisają pod barkami.',
      'Unieś ramiona w boki do linii tułowia, łokcie lekko ugięte.',
      'Opuść hantle powoli.',
    ],
    technique: 'Tylny akton barku jest mały — ciężar dobierz tak, żeby nie zarzucać go plecami.',
    garminCategory: 'LATERAL_RAISE',
  },
  {
    name: 'Rozciąganie gumy przed sobą',
    category: 'Barki',
    secondary: ['Plecy'],
    equipment: 'Guma oporowa',
    difficulty: 'BEGINNER',
    instructions: [
      'Chwyć gumę w wyprostowanych rękach przed sobą na szerokość barków.',
      'Rozciągnij gumę w boki, ściągając łopatki.',
      'Wróć powoli do pozycji wyjściowej.',
    ],
    technique: 'Tani sposób na zdrowe barki — dobry także jako rozgrzewka przed wyciskaniem.',
    garminCategory: 'ROW',
  },
  {
    name: 'Face pull z gumą',
    category: 'Barki',
    secondary: ['Plecy'],
    equipment: 'Guma oporowa',
    difficulty: 'BEGINNER',
    instructions: [
      'Zahacz gumę na wysokości twarzy i chwyć jej końce.',
      'Przyciągnij ręce do twarzy, rozchylając końce gumy i trzymając łokcie wysoko.',
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
  {
    name: 'Uginanie ramion ze sztangą łamaną',
    category: 'Biceps',
    secondary: ['Przedramiona'],
    equipment: 'Sztanga łamana',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań prosto, chwyć sztangę łamaną za skosy podchwytem.',
      'Ugnij ramiona, łokcie przy tułowiu.',
      'Opuść sztangę do pełnego wyprostu.',
    ],
    technique: 'Skos gryfu zdejmuje napięcie z nadgarstków — wariant pierwszego wyboru, gdy prosta sztanga uwiera.',
    garminCategory: 'CURL',
  },
  {
    name: 'Uginanie ramion z hantlami na ławce skośnej',
    category: 'Biceps',
    equipment: 'Hantle',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Ustaw ławkę pod kątem ok. 45° i oprzyj się plecami.',
      'Pozwól ramionom zwisnąć za linią tułowia.',
      'Ugnij ramiona bez ruszania łokciami do przodu.',
      'Opuść hantle do pełnego rozciągnięcia.',
    ],
    technique: 'Ramię za tułowiem rozciąga biceps mocniej niż stojąc — ciężar idzie w dół, zakres w górę.',
    garminCategory: 'CURL',
  },
  {
    name: 'Uginanie nadgarstków ze sztangą',
    category: 'Przedramiona',
    equipment: 'Sztanga łamana',
    difficulty: 'BEGINNER',
    instructions: [
      'Usiądź, oprzyj przedramiona o udo, dłonie podchwytem wystają za kolano.',
      'Opuść sztangę, rozwijając palce.',
      'Zwiń nadgarstki do góry do pełnego skurczu.',
    ],
    garminCategory: 'CURL',
  },
  {
    name: 'Wyciskanie francuskie ze sztangą łamaną',
    category: 'Triceps',
    equipment: 'Sztanga łamana',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Połóż się na ławce, sztanga łamana nad barkami na wyprostowanych ramionach.',
      'Ugnij łokcie i opuść gryf nad czoło lub za głowę.',
      'Wyprostuj ramiona, trzymając łokcie w miejscu.',
    ],
    technique: 'Łokcie zostają nieruchome — gdy jadą do przodu, pracę zabiera klatka.',
    garminCategory: 'TRICEPS_EXTENSION',
  },
  {
    name: 'Wyciskanie sztangi wąskim chwytem',
    category: 'Triceps',
    secondary: ['Klatka piersiowa', 'Barki'],
    equipment: 'Sztanga',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Połóż się na ławce, chwyć sztangę na szerokość barków.',
      'Opuść sztangę do dolnej części klatki, łokcie blisko tułowia.',
      'Wypchnij sztangę do wyprostu łokci.',
    ],
    technique: 'Chwyt na szerokość barków, nie węższy — dłonie przy sobie przeciążają nadgarstki.',
    garminCategory: 'BENCH_PRESS',
  },
  {
    name: 'Prostowanie ramion z gumą nad głowę',
    category: 'Triceps',
    equipment: 'Guma oporowa',
    difficulty: 'BEGINNER',
    instructions: [
      'Nadepnij jeden koniec gumy, drugi chwyć za plecami nad głową.',
      'Wyprostuj ramię nad głowę, łokieć nieruchomo przy uchu.',
      'Opuść rękę powoli za głowę.',
    ],
    garminCategory: 'TRICEPS_EXTENSION',
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
  {
    name: 'Przysiad bułgarski z hantlami',
    category: 'Czworogłowe uda',
    secondary: ['Pośladki', 'Dwugłowe uda'],
    equipment: 'Hantle',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Oprzyj grzbiet tylnej stopy o ławkę, przednia stopa krok przed nią.',
      'Hantle zwisają po bokach.',
      'Zejdź w dół, aż przednie udo będzie równolegle do podłogi.',
      'Wypchnij się przednią nogą do wyprostu.',
    ],
    technique: 'Ciężar na przedniej stopie — tylna noga tylko podtrzymuje równowagę.',
    garminCategory: 'LUNGE',
  },
  {
    name: 'Przysiad przedni ze sztangą',
    category: 'Czworogłowe uda',
    secondary: ['Pośladki', 'Brzuch i core'],
    equipment: 'Sztanga',
    difficulty: 'ADVANCED',
    instructions: [
      'Oprzyj sztangę na przednich wiązkach barków, łokcie wysoko.',
      'Stopy na szerokość barków, klatka wypchnięta.',
      'Zejdź w przysiad z pionowym tułowiem.',
      'Wstań, nie pozwalając łokciom opaść.',
    ],
    technique: 'Łokcie w dół = sztanga z pleców. Trzymaj je wysoko przez całe powtórzenie.',
    garminCategory: 'SQUAT',
  },
  {
    name: 'Martwy ciąg rumuński jednonóż z hantlami',
    category: 'Dwugłowe uda',
    secondary: ['Pośladki', 'Brzuch i core'],
    equipment: 'Hantle',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Stań na jednej nodze, hantel w ręce po tej samej stronie.',
      'Zegnij biodro, opuszczając tułów i unosząc wolną nogę za siebie.',
      'Zatrzymaj się przy rozciągnięciu tyłu uda.',
      'Wróć do pionu, ściskając pośladek.',
    ],
    technique: 'Biodra zostają równo — nie pozwól, by biodro wolnej nogi otwierało się w bok.',
    garminCategory: 'DEADLIFT',
  },
  {
    name: 'Dobry ranek ze sztangą',
    category: 'Dwugłowe uda',
    secondary: ['Pośladki', 'Plecy'],
    equipment: 'Sztanga',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Oprzyj sztangę na plecach jak do przysiadu, kolana lekko ugięte.',
      'Zegnij biodra, odsyłając je do tyłu i opuszczając tułów.',
      'Zejdź tam, gdzie plecy jeszcze trzymają prostą linię.',
      'Wróć do pionu ruchem bioder.',
    ],
    technique: 'Zacznij od pustego gryfu — to ćwiczenie karze za zbyt duży ciężar wygięciem pleców.',
    garminCategory: 'HYPEREXTENSION',
  },
  {
    name: 'Odwodzenie bioder z gumą',
    category: 'Pośladki',
    difficulty: 'BEGINNER',
    equipment: 'Guma oporowa',
    instructions: [
      'Założ gumę nad kolanami, stopy na szerokość bioder.',
      'Zejdź do półprzysiadu.',
      'Rozsuwaj kolana na zewnątrz wbrew gumie i wracaj kontrolowanie.',
    ],
    garminCategory: 'HIP_STABILITY',
  },
  {
    name: 'Wspięcia na palce z hantlami',
    category: 'Łydki',
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Stań przodostopiem na progu lub stopniu, hantle po bokach.',
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
  {
    name: 'Deska boczna',
    category: 'Brzuch i core',
    secondary: ['Pośladki'],
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    tracking: 'TIME',
    instructions: [
      'Połóż się na boku, oprzyj się na łokciu pod barkiem.',
      'Unieś biodra do prostej linii od głowy do stóp.',
      'Utrzymaj pozycję przez zadany czas, potem zmień stronę.',
    ],
    technique: 'Czas liczy się na jedną stronę — drugą zrób w kolejnej serii.',
    garminCategory: 'PLANK',
  },
  {
    name: 'Pallof press z gumą',
    category: 'Brzuch i core',
    equipment: 'Guma oporowa',
    difficulty: 'INTERMEDIATE',
    instructions: [
      'Zahacz gumę na wysokości klatki i stań do niej bokiem.',
      'Chwyć gumę oburącz przy klatce, napnij brzuch.',
      'Wypchnij ręce przed siebie, nie pozwalając tułowiowi się obrócić.',
      'Wróć do klatki i powtórz, potem zmień stronę.',
    ],
    technique: 'Praca polega na tym, żeby się nie obrócić — ruch rąk jest tylko pretekstem.',
    garminCategory: 'CORE',
  },
  {
    name: 'Skręty tułowia z hantlem',
    category: 'Brzuch i core',
    equipment: 'Hantle',
    difficulty: 'BEGINNER',
    instructions: [
      'Usiądź z ugiętymi kolanami, odchyl tułów do tyłu.',
      'Trzymaj hantel oburącz przy klatce.',
      'Obróć tułów na jedną stronę, potem na drugą.',
    ],
    technique: 'Obracaj tułowiem, nie samymi rękami — plecy trzymaj prosto.',
    garminCategory: 'CORE',
  },
  {
    name: 'Unoszenie nóg leżąc',
    category: 'Brzuch i core',
    equipment: 'Masa ciała',
    difficulty: 'BEGINNER',
    instructions: [
      'Połóż się na plecach, ręce wzdłuż tułowia.',
      'Unieś wyprostowane nogi do pionu.',
      'Opuszczaj je, aż lędźwie zaczną odrywać się od podłogi, i wróć do góry.',
    ],
    technique: 'Zakres kończy się tam, gdzie lędźwie odchodzą od podłogi — nie niżej.',
    garminCategory: 'LEG_RAISE',
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

/**
 * Szablony wytrzymałościowe. Odcinki opisujemy płasko; odcinki należące do grupy powtórzeń
 * idą zaraz po niej i mają `inRepeat: true`, bo dwa poziomy zagnieżdżenia wystarczą.
 */
export type SeedSegment = {
  kind: SegmentKind;
  inRepeat?: boolean;
  repeatCount?: number;
  durationType: DurationType;
  distanceMeters?: number;
  durationSeconds?: number;
  targetType?: TargetType;
  targetLow?: number;
  targetHigh?: number;
  stroke?: Stroke;
};

export type SeedEnduranceTemplate = {
  sport: Sport;
  title: string;
  description: string;
  segments: SeedSegment[];
};

export const seedEnduranceTemplates: SeedEnduranceTemplate[] = [
  {
    sport: 'RUNNING',
    title: 'Wybieganie spokojne',
    description: 'Bieg ciągły w tempie konwersacyjnym. Podstawa objętości w każdym planie.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 600 },
      { kind: 'WORK', durationType: 'DISTANCE', distanceMeters: 8000, targetType: 'HEART_RATE', targetLow: 120, targetHigh: 145 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 300 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Interwały 6×400 m',
    description: 'Akcent szybkościowy. Odcinki mocno, przerwy truchtem — nie na stojąco.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 900 },
      { kind: 'REPEAT', repeatCount: 6, durationType: 'OPEN' },
      { kind: 'WORK', inRepeat: true, durationType: 'DISTANCE', distanceMeters: 400, targetType: 'PACE', targetLow: 240, targetHigh: 270 },
      { kind: 'RECOVERY', inRepeat: true, durationType: 'TIME', durationSeconds: 120 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 600 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Podbiegi 8×30 s',
    description: 'Siła biegowa. Pod górę mocno, z powrotem spokojnym truchtem.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 900 },
      { kind: 'REPEAT', repeatCount: 8, durationType: 'OPEN' },
      { kind: 'WORK', inRepeat: true, durationType: 'TIME', durationSeconds: 30 },
      { kind: 'RECOVERY', inRepeat: true, durationType: 'TIME', durationSeconds: 120 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 600 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Rozbieganie regeneracyjne',
    description: 'Krótko i bardzo wolno — dzień po mocnym akcencie. Tętno niżej niż na wybieganiu.',
    segments: [
      { kind: 'WORK', durationType: 'DISTANCE', distanceMeters: 5000, targetType: 'HEART_RATE', targetLow: 110, targetHigh: 135 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 300 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Długie wybieganie',
    description: 'Najdłuższy bieg tygodnia. Tempo takie, żeby dało się rozmawiać do końca.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 600 },
      { kind: 'WORK', durationType: 'DISTANCE', distanceMeters: 16000, targetType: 'HEART_RATE', targetLow: 125, targetHigh: 145 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 600 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Bieg tempowy 20 minut',
    description: 'Tempo progowe: ciężko, ale pod kontrolą. Wolniej niż odcinki, szybciej niż wybieganie.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 900 },
      { kind: 'WORK', durationType: 'TIME', durationSeconds: 1200, targetType: 'PACE', targetLow: 280, targetHigh: 300 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 600 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Interwały 5×1000 m',
    description: 'Dłuższe odcinki niż na 400 m, więc i tempo odrobinę wolniejsze. Przerwa truchtem.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 900 },
      { kind: 'REPEAT', repeatCount: 5, durationType: 'OPEN' },
      { kind: 'WORK', inRepeat: true, durationType: 'DISTANCE', distanceMeters: 1000, targetType: 'PACE', targetLow: 255, targetHigh: 275 },
      { kind: 'RECOVERY', inRepeat: true, durationType: 'TIME', durationSeconds: 180 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 600 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Interwały 8×200 m',
    description: 'Krótkie i szybkie. Akcent na rytm biegu, nie na zmęczenie.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 900 },
      { kind: 'REPEAT', repeatCount: 8, durationType: 'OPEN' },
      { kind: 'WORK', inRepeat: true, durationType: 'DISTANCE', distanceMeters: 200, targetType: 'PACE', targetLow: 210, targetHigh: 240 },
      { kind: 'RECOVERY', inRepeat: true, durationType: 'TIME', durationSeconds: 120 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 600 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Fartlek 10×1 minuta',
    description: 'Zabawa biegowa: minuta mocno, dwie spokojnie. Bez zegarka na tempo — na czucie.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 900 },
      { kind: 'REPEAT', repeatCount: 10, durationType: 'OPEN' },
      { kind: 'WORK', inRepeat: true, durationType: 'TIME', durationSeconds: 60 },
      { kind: 'RECOVERY', inRepeat: true, durationType: 'TIME', durationSeconds: 120 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 600 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Bieg progresywny 9 km',
    description: 'Trzy bloki po 3 km, każdy szybszy od poprzedniego. Ostatni ma boleć.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 600 },
      { kind: 'WORK', durationType: 'DISTANCE', distanceMeters: 3000, targetType: 'PACE', targetLow: 330, targetHigh: 350 },
      { kind: 'WORK', durationType: 'DISTANCE', distanceMeters: 3000, targetType: 'PACE', targetLow: 300, targetHigh: 320 },
      { kind: 'WORK', durationType: 'DISTANCE', distanceMeters: 3000, targetType: 'PACE', targetLow: 270, targetHigh: 290 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 600 },
    ],
  },
  {
    sport: 'RUNNING',
    title: 'Marszobieg 8×3 minuty',
    description: 'Wejście w bieganie od zera: trzy minuty truchtu, minuta marszu. Bez biegu non stop.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 300 },
      { kind: 'REPEAT', repeatCount: 8, durationType: 'OPEN' },
      { kind: 'WORK', inRepeat: true, durationType: 'TIME', durationSeconds: 180 },
      { kind: 'RECOVERY', inRepeat: true, durationType: 'TIME', durationSeconds: 60 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 300 },
    ],
  },
  {
    sport: 'CYCLING',
    title: 'Rower — jazda ciągła',
    description: 'Spokojna jazda w drugiej strefie tętna. Buduje bazę tlenową.',
    segments: [
      { kind: 'WARMUP', durationType: 'TIME', durationSeconds: 600 },
      { kind: 'WORK', durationType: 'TIME', durationSeconds: 3600, targetType: 'HEART_RATE', targetLow: 120, targetHigh: 150 },
      { kind: 'COOLDOWN', durationType: 'TIME', durationSeconds: 300 },
    ],
  },
  {
    sport: 'SWIMMING',
    title: 'Pływanie 10×100 m',
    description: 'Odcinki na basenie z krótką przerwą na ścianie.',
    segments: [
      { kind: 'WARMUP', durationType: 'DISTANCE', distanceMeters: 400, stroke: 'ANY' },
      { kind: 'REPEAT', repeatCount: 10, durationType: 'OPEN' },
      { kind: 'WORK', inRepeat: true, durationType: 'DISTANCE', distanceMeters: 100, stroke: 'FREE' },
      { kind: 'RECOVERY', inRepeat: true, durationType: 'TIME', durationSeconds: 30 },
      { kind: 'COOLDOWN', durationType: 'DISTANCE', distanceMeters: 200, stroke: 'BACKSTROKE' },
    ],
  },
  // „Różne” to jedna pozycja: ile to trwa. Nazwa aktywności siedzi w tytule planu, więc zamiast
  // mnożyć dyscypliny, kopiuje się szablon i zmienia mu nazwę.
  {
    sport: 'OTHER',
    title: 'Taniec 60 minut',
    description: 'Godzina zajęć. Zmień nazwę i czas, jeśli Twoje trwają inaczej.',
    segments: [{ kind: 'WORK', durationType: 'TIME', durationSeconds: 3600 }],
  },
  {
    sport: 'OTHER',
    title: 'Tenis 90 minut',
    description: 'Gra albo trening na korcie — liczy się czas na nogach.',
    segments: [{ kind: 'WORK', durationType: 'TIME', durationSeconds: 5400 }],
  },
  {
    sport: 'OTHER',
    title: 'Inna aktywność 60 minut',
    description: 'Pusty szablon na wszystko, czego nie ma w pozostałych dyscyplinach — skopiuj i nazwij po swojemu.',
    segments: [{ kind: 'WORK', durationType: 'TIME', durationSeconds: 3600 }],
  },
];

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
  {
    title: 'Dom — Góra ciała',
    description: 'Cała góra w jednej sesji: ławka, drążek, hantle, sztanga łamana. 2× w tygodniu.',
    exercises: [
      { exercise: 'Wyciskanie sztangi na ławce płaskiej', sets: 4, reps: 6, rest: 150 },
      { exercise: 'Podciąganie podchwytem', sets: 4, reps: 8, rest: 120 },
      { exercise: 'Wyciskanie hantli nad głowę siedząc', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Wiosłowanie hantlem jednorącz', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Unoszenie hantli bokiem', sets: 3, reps: 15, rest: 60 },
      { exercise: 'Uginanie ramion ze sztangą łamaną', sets: 3, reps: 10, rest: 60 },
      { exercise: 'Wyciskanie francuskie ze sztangą łamaną', sets: 3, reps: 10, rest: 60 },
    ],
  },
  {
    title: 'Dom — Dół ciała',
    description: 'Nogi i pośladki bez maszyn — sztanga, hantle i ławka pod przysiad bułgarski.',
    exercises: [
      { exercise: 'Przysiad ze sztangą', sets: 4, reps: 8, rest: 150 },
      { exercise: 'Martwy ciąg rumuński', sets: 3, reps: 10, rest: 120 },
      { exercise: 'Przysiad bułgarski z hantlami', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Hip thrust ze sztangą', sets: 3, reps: 12, rest: 90 },
      { exercise: 'Wspięcia na palce z hantlami', sets: 4, reps: 15, rest: 45 },
      { exercise: 'Plank (deska)', sets: 3, durationSeconds: 45, rest: 45 },
    ],
  },
  {
    title: 'Dom — Push (pchanie)',
    description: 'Domowy odpowiednik dnia Push: klatka, barki, triceps. Bez wyciągu.',
    exercises: [
      { exercise: 'Wyciskanie sztangi na ławce płaskiej', sets: 4, reps: 8, rest: 150 },
      { exercise: 'Wyciskanie hantli na ławce skośnej', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Wyciskanie żołnierskie (OHP)', sets: 3, reps: 8, rest: 120 },
      { exercise: 'Unoszenie hantli bokiem', sets: 3, reps: 15, rest: 60 },
      { exercise: 'Wyciskanie sztangi wąskim chwytem', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Pompki', sets: 2, reps: 12, rest: 60 },
    ],
  },
  {
    title: 'Dom — Pull (przyciąganie)',
    description: 'Domowy dzień Pull: martwy ciąg, drążek, wiosłowanie. Face pull na gumie zamiast wyciągu.',
    exercises: [
      { exercise: 'Martwy ciąg', sets: 3, reps: 5, rest: 180 },
      { exercise: 'Podciąganie na drążku', sets: 4, reps: 8, rest: 120 },
      { exercise: 'Wiosłowanie sztangą w opadzie', sets: 3, reps: 8, rest: 90 },
      { exercise: 'Face pull z gumą', sets: 3, reps: 15, rest: 45 },
      { exercise: 'Uginanie ramion ze sztangą łamaną', sets: 3, reps: 10, rest: 60 },
      { exercise: 'Uginanie ramion z hantlami (młotkowe)', sets: 2, reps: 12, rest: 45 },
    ],
  },
  {
    title: 'Dom — FBW z hantlami',
    description: 'Całe ciało tylko na hantlach i ławce — bez rozkładania sztangi i stojaków.',
    exercises: [
      { exercise: 'Przysiad goblet', sets: 3, reps: 12, rest: 90 },
      { exercise: 'Wyciskanie hantli na ławce płaskiej', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Wiosłowanie hantlami w opadzie', sets: 3, reps: 10, rest: 90 },
      { exercise: 'Wyciskanie Arnolda', sets: 3, reps: 10, rest: 75 },
      { exercise: 'Martwy ciąg rumuński jednonóż z hantlami', sets: 3, reps: 10, rest: 60 },
      { exercise: 'Skręty tułowia z hantlem', sets: 3, reps: 16, rest: 45 },
    ],
  },
  {
    title: 'Dom — Ramiona i barki',
    description: 'Dzień uzupełniający na hantle i sztangę łamaną. Lekki sprzęt, mało miejsca.',
    exercises: [
      { exercise: 'Wyciskanie Arnolda', sets: 4, reps: 10, rest: 90 },
      { exercise: 'Unoszenie hantli bokiem', sets: 3, reps: 15, rest: 60 },
      { exercise: 'Unoszenie hantli w opadzie', sets: 3, reps: 15, rest: 60 },
      { exercise: 'Uginanie ramion ze sztangą łamaną', sets: 3, reps: 10, rest: 60 },
      { exercise: 'Uginanie ramion z hantlami na ławce skośnej', sets: 3, reps: 12, rest: 45 },
      { exercise: 'Wyciskanie francuskie ze sztangą łamaną', sets: 3, reps: 12, rest: 45 },
      { exercise: 'Uginanie nadgarstków ze sztangą', sets: 2, reps: 15, rest: 45 },
    ],
  },
  {
    title: 'Dom — Obwód z gumami',
    description: 'Cicho i bez ciężarów: na wyjazd, lekki tydzień albo dzień po mocnym treningu.',
    exercises: [
      { exercise: 'Przyciąganie gumy do brzucha siedząc', sets: 3, reps: 15, rest: 45 },
      { exercise: 'Rozciąganie gumy przed sobą', sets: 3, reps: 20, rest: 30 },
      { exercise: 'Prostowanie ramion z gumą nad głowę', sets: 3, reps: 15, rest: 30 },
      { exercise: 'Odwodzenie bioder z gumą', sets: 3, reps: 20, rest: 30 },
      { exercise: 'Pallof press z gumą', sets: 3, reps: 10, rest: 45 },
      { exercise: 'Przysiad z masą ciała', sets: 3, reps: 20, rest: 45 },
    ],
  },
  {
    title: 'Dom — Core i stabilizacja',
    description: 'Krótka sesja na brzuch i stabilizację tułowia. Dobra jako dodatek po nogach.',
    exercises: [
      { exercise: 'Unoszenie nóg w zwisie', sets: 3, reps: 10, rest: 60 },
      { exercise: 'Plank (deska)', sets: 3, durationSeconds: 45, rest: 45 },
      { exercise: 'Deska boczna', sets: 3, durationSeconds: 30, rest: 30 },
      { exercise: 'Pallof press z gumą', sets: 3, reps: 10, rest: 45 },
      { exercise: 'Martwy robak (dead bug)', sets: 3, reps: 12, rest: 45 },
      { exercise: 'Spacer farmera', sets: 3, durationSeconds: 40, rest: 60 },
    ],
  },
  {
    title: 'Dom — 20 minut',
    description: 'Gdy czasu jest mało: cztery ćwiczenia na całe ciało, jeden zestaw hantli.',
    exercises: [
      { exercise: 'Przysiad goblet', sets: 3, reps: 12, rest: 60 },
      { exercise: 'Pompki', sets: 3, reps: 12, rest: 60 },
      { exercise: 'Wiosłowanie hantlem jednorącz', sets: 3, reps: 12, rest: 60 },
      { exercise: 'Plank (deska)', sets: 2, durationSeconds: 45, rest: 45 },
    ],
  },
];
