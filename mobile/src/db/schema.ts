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
 */
export const sports = ['STRENGTH', 'RUNNING', 'CYCLING', 'SWIMMING'] as const;
export type Sport = (typeof sports)[number];

export const workoutPlans = sqliteTable('workout_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sport: text('sport', { enum: sports }).notNull().default('STRENGTH'),
  title: text('title').notNull(),
  description: text('description'),
  isTemplate: integer('is_template', { mode: 'boolean' }).notNull().default(false),
  // Szablon, z którego skopiowano plan (null dla planów tworzonych od zera).
  sourceTemplateId: integer('source_template_id'),
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
  notes: text('notes'),
});

/**
 * Aktywności z Health Connect odłożone przez użytkownika — nie każdy trening z zegarka ma
 * trafić do historii. Trzymamy tytuł i datę, żeby dało się je przejrzeć i przywrócić;
 * `record_id` to identyfikator rekordu Health Connect, po którym poznajemy go przy odczycie.
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
