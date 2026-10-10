import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Schemat bazy — rozszerzenie DDL ze specyfikacji v1.0 (patrz PLAN_ETAPOWY.md, etap 1).
// Daty przechowywane jako tekst ISO 8601 (DATE: YYYY-MM-DD, DATETIME: pełny ISO).

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

// --- 1. Kategorie (partie mięśniowe) i słowniki ---

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
});

export const equipment = sqliteTable('equipment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

export const difficultyLevels = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type DifficultyLevel = (typeof difficultyLevels)[number];

export const trackingTypes = ['REPS', 'TIME'] as const;
export type TrackingType = (typeof trackingTypes)[number];

export const exercises = sqliteTable(
  'exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Główna partia mięśniowa; dodatkowe w exercise_muscles.
    categoryId: integer('category_id').references(() => categories.id),
    equipmentId: integer('equipment_id').references(() => equipment.id),
    name: text('name').notNull(),
    instructions: text('instructions'),
    techniqueNotes: text('technique_notes'),
    imageUrl: text('image_url'),
    /** Film instruktażowy — własny odnośnik użytkownika; bez niego otwieramy wyszukiwanie. */
    videoUrl: text('video_url'),
    difficultyLevel: text('difficulty_level', { enum: difficultyLevels }),
    trackingType: text('tracking_type', { enum: trackingTypes }).notNull().default('REPS'),
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    // Mapowanie na katalog ćwiczeń Garmin Training API (etap 9).
    garminCategory: text('garmin_category'),
    garminExerciseName: text('garmin_exercise_name'),
    createdAt: createdAt(),
  },
  (t) => [index('exercises_category_idx').on(t.categoryId), index('exercises_equipment_idx').on(t.equipmentId)],
);

// Dodatkowe (pomocnicze) partie mięśniowe ćwiczenia — N:M.
export const exerciseMuscles = sqliteTable(
  'exercise_muscles',
  {
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.categoryId] })],
);

// --- 2. Plany i szablony ---

/**
 * Sport jest cechą planu i sesji, nie ćwiczenia. Siła ma serie, powtórzenia i ciężar; pozostałe
 * dyscypliny — odcinki z dystansem lub czasem. Dane sprzed wprowadzenia sportów to siła.
 *
 * `OTHER` to worek na wszystko, co trenuje się raz na jakiś czas — taniec, tenis, wspinaczka.
 * Zamiast mnożyć dyscypliny z osobnymi ikonami i statystykami, nazwę nosi tytuł planu.
 */
export const sports = ['STRENGTH', 'RUNNING', 'CYCLING', 'SWIMMING', 'OTHER'] as const;
export type Sport = (typeof sports)[number];

export const workoutPlans = sqliteTable('workout_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sport: text('sport', { enum: sports }).notNull().default('STRENGTH'),
  title: text('title').notNull(),
  description: text('description'),
  isTemplate: integer('is_template', { mode: 'boolean' }).notNull().default(false),
  // Szablon, z którego skopiowano plan (null dla planów tworzonych od zera).
  sourceTemplateId: integer('source_template_id'),
  /** Identyfikator treningu w bibliotece Garmin Connect; null, gdy plan tam nie trafił. */
  garminWorkoutId: text('garmin_workout_id'),
  createdAt: createdAt(),
  updatedAt: text('updated_at'),
});

export const planExercises = sqliteTable(
  'plan_exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    planId: integer('plan_id')
      .notNull()
      .references(() => workoutPlans.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    targetSets: integer('target_sets').notNull(),
    targetReps: integer('target_reps'),
    targetWeight: real('target_weight'),
    targetDurationSeconds: integer('target_duration_seconds'),
    restDurationSeconds: integer('rest_duration_seconds').notNull().default(90),
    notes: text('notes'),
  },
  (t) => [index('plan_exercises_plan_idx').on(t.planId)],
);

/**
 * Odcinki treningu wytrzymałościowego. Dwa poziomy wystarczą: odcinek `REPEAT` jest grupą
 * powtórzeń, a odcinki wskazujące na nią przez `parentId` są jej wnętrzem. Tak samo opisuje
 * trening Garmin i plik FIT, więc wysyłka na zegarek nie wymaga tłumaczenia jednego modelu
 * na drugi.
 */
export const segmentKinds = ['WARMUP', 'WORK', 'RECOVERY', 'COOLDOWN', 'REPEAT'] as const;
export type SegmentKind = (typeof segmentKinds)[number];

/** Czym kończy się odcinek: przebiegniętym dystansem, upływem czasu albo decyzją biegacza. */
export const durationTypes = ['DISTANCE', 'TIME', 'OPEN'] as const;
export type DurationType = (typeof durationTypes)[number];

/** Cel odcinka. Tempo trzymamy w sekundach na kilometr, tętno w uderzeniach na minutę. */
export const targetTypes = ['NONE', 'PACE', 'HEART_RATE'] as const;
export type TargetType = (typeof targetTypes)[number];

/** Styl pływacki odcinka. `ANY` znaczy „dowolny” — tak samo, jak rozumie to zegarek. */
export const strokes = ['ANY', 'FREE', 'BACKSTROKE', 'BREASTSTROKE', 'FLY', 'MEDLEY', 'DRILL'] as const;
export type Stroke = (typeof strokes)[number];

/** Sprzęt pływacki użyty na odcinku. Nazwa z przedrostkiem, bo `equipment` to już tabela
 *  sprzętu siłowni — to dwie różne rzeczy i nie wolno ich pomylić. */
export const swimEquipment = ['FINS', 'KICKBOARD', 'PADDLES', 'PULL_BUOY', 'SNORKEL'] as const;
export type SwimEquipment = (typeof swimEquipment)[number];

/** Instrukcja techniczna odcinka: same nogi, same ręce albo ćwiczenie techniczne. */
export const drills = ['KICK', 'PULL', 'DRILL'] as const;
export type Drill = (typeof drills)[number];

const segmentColumns = {
  parentId: integer('parent_id'),
  orderIndex: integer('order_index').notNull(),
  kind: text('kind', { enum: segmentKinds }).notNull(),
  repeatCount: integer('repeat_count'), // tylko dla grupy powtórzeń
  durationType: text('duration_type', { enum: durationTypes }).notNull().default('OPEN'),
  distanceMeters: real('distance_meters'),
  durationSeconds: integer('duration_seconds'),
  targetType: text('target_type', { enum: targetTypes }).notNull().default('NONE'),
  targetLow: real('target_low'),
  targetHigh: real('target_high'),
  /** Tylko pływanie; null w pozostałych dyscyplinach. */
  stroke: text('stroke', { enum: strokes }),
  equipment: text('equipment', { enum: swimEquipment }),
  drill: text('drill', { enum: drills }),
  notes: text('notes'),
};

export const planSegments = sqliteTable(
  'plan_segments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    planId: integer('plan_id')
      .notNull()
      .references(() => workoutPlans.id, { onDelete: 'cascade' }),
    ...segmentColumns,
  },
  (t) => [index('plan_segments_plan_idx').on(t.planId)],
);

/**
 * Pamięć seeda: tytuły szablonów, które kiedykolwiek wgrał. Szablony wolno zmieniać i usuwać,
 * a seed dopasowuje rekordy po nazwie — bez tej listy usunięty szablon wracałby przy najbliższym
 * podbiciu SEED_VERSION, a przemianowany dorobiłby się bliźniaka pod starą nazwą.
 */
export const seededTemplates = sqliteTable('seeded_templates', {
  title: text('title').primaryKey(),
});

// --- 3. Harmonogram i powiadomienia ---

export const scheduledWorkouts = sqliteTable(
  'scheduled_workouts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    planId: integer('plan_id')
      .notNull()
      .references(() => workoutPlans.id, { onDelete: 'cascade' }),
    scheduledDate: text('scheduled_date').notNull(), // YYYY-MM-DD
    scheduledTime: text('scheduled_time'), // HH:mm, null = cały dzień
    reminderOffsetMinutes: integer('reminder_offset_minutes'),
    notificationId: text('notification_id'),
    isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
    garminSynced: integer('garmin_synced', { mode: 'boolean' }).notNull().default(false),
    garminWorkoutId: text('garmin_workout_id'),
    garminScheduleId: text('garmin_schedule_id'),
  },
  (t) => [index('scheduled_workouts_date_idx').on(t.scheduledDate)],
);

// --- 4. Wykonane treningi i logi ---

export const sessionStatuses = ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scheduledId: integer('scheduled_id').references(() => scheduledWorkouts.id, { onDelete: 'set null' }),
    // Sesja może powstać bez harmonogramu (z planu lub „pusty trening”).
    planId: integer('plan_id').references(() => workoutPlans.id, { onDelete: 'set null' }),
    // Nazwa i sport z chwili startu — historia zachowuje je także po usunięciu planu.
    title: text('title'),
    sport: text('sport', { enum: sports }).notNull().default('STRENGTH'),
    status: text('status', { enum: sessionStatuses }).notNull().default('IN_PROGRESS'),
    startTime: text('start_time').notNull(),
    endTime: text('end_time'),
    totalDurationSeconds: integer('total_duration_seconds'),
    userNotes: text('user_notes'),
    rpeRating: integer('rpe_rating'),
  },
  (t) => [index('workout_sessions_start_idx').on(t.startTime)],
);

/**
 * Migawka planu z chwili rozpoczęcia sesji. Dzięki niej późniejsza edycja planu nie zmienia
 * historii, a trening „pusty” (bez planu) ma tę samą strukturę co trening z planu.
 */
export const sessionExercises = sqliteTable(
  'session_exercises',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    targetSets: integer('target_sets').notNull(),
    targetReps: integer('target_reps'),
    targetWeight: real('target_weight'),
    targetDurationSeconds: integer('target_duration_seconds'),
    restDurationSeconds: integer('rest_duration_seconds').notNull().default(90),
    notes: text('notes'),
  },
  (t) => [index('session_exercises_session_idx').on(t.sessionId)],
);

export const loggedSets = sqliteTable(
  'logged_sets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    sessionExerciseId: integer('session_exercise_id')
      .notNull()
      .references(() => sessionExercises.id, { onDelete: 'cascade' }),
    // Zduplikowane z session_exercises dla wygody analityki i sprawdzania użycia ćwiczenia.
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    setNumber: integer('set_number').notNull(),
    repsCompleted: integer('reps_completed'),
    weightKg: real('weight_kg'),
    durationSeconds: integer('duration_seconds'),
    rpe: integer('rpe'), // RPE 1–10 dla serii (COULD HAVE)
    completedAt: text('completed_at'), // null = seria zaplanowana, niewykonana
  },
  (t) => [index('logged_sets_session_idx').on(t.sessionId), index('logged_sets_exercise_idx').on(t.exerciseId)],
);

/** Migawka odcinków z chwili startu sesji — odpowiednik session_exercises dla wytrzymałości. */
export const sessionSegments = sqliteTable(
  'session_segments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    ...segmentColumns,
  },
  (t) => [index('session_segments_session_idx').on(t.sessionId)],
);

/**
 * Co faktycznie pokonane. Jedna grupa powtórzeń daje tyle wierszy, ile iteracji — każde
 * okrążenie zapisujemy osobno, bo inaczej nie da się pokazać, które było wolniejsze.
 */
export const loggedSegments = sqliteTable(
  'logged_segments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    sessionSegmentId: integer('session_segment_id')
      .notNull()
      .references(() => sessionSegments.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    /** Którą iterację grupy powtórzeń zapisuje ten wiersz; 1 dla odcinków poza grupą. */
    iteration: integer('iteration').notNull().default(1),
    distanceMeters: real('distance_meters'),
    durationSeconds: integer('duration_seconds'),
    avgHeartRate: integer('avg_heart_rate'),
    completedAt: text('completed_at'), // null = odcinek zaplanowany, niewykonany
  },
  (t) => [index('logged_segments_session_idx').on(t.sessionId)],
);

// --- 5. Dane biometryczne Garmin ---
// Dane z aktywności są 1:1 z sesją, dane dobowe są per dzień (nie per sesja).

export const garminActivityMetrics = sqliteTable('garmin_activity_metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id')
    .notNull()
    .unique()
    .references(() => workoutSessions.id, { onDelete: 'cascade' }),
  garminActivityId: text('garmin_activity_id'),
  avgHeartRate: integer('avg_heart_rate'),
  maxHeartRate: integer('max_heart_rate'),
  caloriesBurned: integer('calories_burned'),
  rawGarminJson: text('raw_garmin_json'),
  syncedAt: createdAt(),
});

export const garminDailyHealth = sqliteTable('garmin_daily_health', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  summaryDate: text('summary_date').notNull().unique(), // YYYY-MM-DD
  restingHeartRate: integer('resting_heart_rate'),
  hrvStatus: text('hrv_status'),
  hrvAvgMs: integer('hrv_avg_ms'),
  stressLevel: integer('stress_level'),
  sleepDurationMinutes: integer('sleep_duration_minutes'),
  sleepScore: integer('sleep_score'),
  bloodPressureSystolic: integer('blood_pressure_systolic'),
  bloodPressureDiastolic: integer('blood_pressure_diastolic'),
  activeCalories: integer('active_calories'),
  rawGarminJson: text('raw_garmin_json'),
  syncedAt: createdAt(),
});

// --- 6. Pomiary ciała i ustawienia ---

export const bodyMeasurements = sqliteTable('body_measurements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  measuredOn: text('measured_on').notNull(), // YYYY-MM-DD
  weightKg: real('weight_kg'),
  bodyFatPercent: real('body_fat_percent'),
  chestCm: real('chest_cm'),
  waistCm: real('waist_cm'),
  hipsCm: real('hips_cm'),
  armCm: real('arm_cm'),
  thighCm: real('thigh_cm'),
  /** Ciśnienie mierzone własnym ciśnieniomierzem — osobno od odczytów z Garmin Connect. */
  systolic: integer('systolic'),
  diastolic: integer('diastolic'),
  notes: text('notes'),
});

/**
 * Aktywności z zegarka odłożone przez użytkownika — nie każdy trening ma trafić do historii.
 * Trzymamy tytuł i datę, żeby dało się je przejrzeć i przywrócić; `record_id` to identyfikator
 * aktywności w Garmin Connect, po którym poznajemy ją przy kolejnym odczycie.
 */
export const archivedActivities = sqliteTable('archived_activities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recordId: text('record_id').notNull().unique(),
  title: text('title').notNull(),
  startTime: text('start_time').notNull(),
  archivedAt: createdAt(),
});

// Proste ustawienia klucz–wartość (e-mail, preferencje powiadomień, wersja seeda).
// Sekrety (tokeny Garmin) trzymamy w expo-secure-store, nie tutaj.
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

// --- 7. Nawodnienie ---

export const hydrationSources = ['APP', 'GARMIN'] as const;
export type HydrationSource = (typeof hydrationSources)[number];

/**
 * Wypite porcje — wiersz na każdą, a nie licznik dzienny. Dzięki temu da się pokazać oś czasu
 * dnia i cofnąć pomyłkę, a tygodniowe słupki wychodzą ze zwykłego sumowania.
 *
 * Dzień trzymamy osobno od znacznika czasu, bo doba wodna to doba lokalna, nie UTC: licząc ją
 * za każdym razem z `logged_at`, szklanka wypita o 23:30 wpadałaby do jutra.
 */
export const hydrationLogs = sqliteTable(
  'hydration_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    loggedAt: text('logged_at').notNull(),
    dayKey: text('day_key').notNull(), // YYYY-MM-DD
    milliliters: integer('milliliters').notNull(),
    source: text('source', { enum: hydrationSources }).notNull().default('APP'),
  },
  (t) => [index('hydration_logs_day_idx').on(t.dayKey)],
);

/**
 * Dzienna korekta celu — upał, sauna, długi lot. Leży tu wyłącznie to, co użytkownik sam dołożył:
 * wypite mililitry liczymy z logu, a cel z masy ciała i treningu, więc nie ma tu nic, co dałoby
 * się wyliczyć skądinąd i z czasem rozjechać.
 */
export const hydrationDays = sqliteTable('hydration_days', {
  dayKey: text('day_key').primaryKey(), // YYYY-MM-DD
  extraMl: integer('extra_ml').notNull().default(0),
});

// --- 8. Plan długoterminowy pod cel ---

export const goalStatuses = ['ACTIVE', 'DONE', 'ABANDONED'] as const;
export type GoalStatus = (typeof goalStatuses)[number];

/** Faza cyklu. Nazwy za praktyką treningową: baza, budowanie, szczyt, roztrenowanie, start. */
export const goalPhases = ['BASE', 'BUILD', 'PEAK', 'TAPER', 'RACE'] as const;
export type GoalPhase = (typeof goalPhases)[number];

/** Rodzaj jednostki w planie. Od tego zależą odcinki, tempo i nazwa treningu. */
export const goalWorkoutKinds = ['EASY', 'LONG', 'TEMPO', 'INTERVALS', 'RACE'] as const;
export type GoalWorkoutKind = (typeof goalWorkoutKinds)[number];

/**
 * Cel długoterminowy: zawody z datą i dystansem. Plan pod niego liczymy z formy odczytanej
 * z historii, więc tu trzymamy tylko to, czego aplikacja sama nie wie — kiedy start, na jakim
 * dystansie, w jakim czasie i w które dni tygodnia da się trenować.
 */
export const trainingGoals = sqliteTable('training_goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sport: text('sport', { enum: sports }).notNull().default('RUNNING'),
  title: text('title').notNull(),
  eventDate: text('event_date').notNull(), // YYYY-MM-DD
  distanceMeters: real('distance_meters').notNull(),
  /** Czas docelowy w sekundach; null, gdy chodzi o samo dojechanie do mety. */
  targetSeconds: integer('target_seconds'),
  /** Dni tygodnia rozdzielone spacją, 0 = poniedziałek. */
  weekDays: text('week_days').notNull(),
  status: text('status', { enum: goalStatuses }).notNull().default('ACTIVE'),
  /** Czym ułożono plan: regułami w aplikacji czy modelem. Null dla planu jeszcze niewygenerowanego. */
  plannedBy: text('planned_by'),
  notes: text('notes'),
  createdAt: createdAt(),
});

/**
 * Jednostka wygenerowanego planu. Trzymamy ją osobno od `scheduled_workouts`, bo plan powstaje
 * cały naraz i ma być widoczny przed wpisaniem do kalendarza — a po wpisaniu musi pozostać
 * wiadomo, który termin należy do którego celu, żeby dało się go przeliczyć albo przesunąć.
 */
export const goalWorkouts = sqliteTable(
  'goal_workouts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    goalId: integer('goal_id')
      .notNull()
      .references(() => trainingGoals.id, { onDelete: 'cascade' }),
    weekIndex: integer('week_index').notNull(),
    phase: text('phase', { enum: goalPhases }).notNull(),
    plannedDate: text('planned_date').notNull(), // YYYY-MM-DD
    kind: text('kind', { enum: goalWorkoutKinds }).notNull(),
    title: text('title').notNull(),
    distanceMeters: real('distance_meters'),
    durationSeconds: integer('duration_seconds'),
    /** Tempo w sekundach na kilometr; null, gdy nie da się go wyliczyć. */
    paceSeconds: integer('pace_seconds'),
    notes: text('notes'),
    /** Plan i termin powstałe z tej jednostki; null, dopóki nie trafiła do kalendarza. */
    planId: integer('plan_id').references(() => workoutPlans.id, { onDelete: 'set null' }),
    scheduledId: integer('scheduled_id').references(() => scheduledWorkouts.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [index('goal_workouts_goal_idx').on(t.goalId), index('goal_workouts_date_idx').on(t.plannedDate)],
);
