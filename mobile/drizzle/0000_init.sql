CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `body_measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`measured_on` text NOT NULL,
	`weight_kg` real,
	`body_fat_percent` real,
	`chest_cm` real,
	`waist_cm` real,
	`hips_cm` real,
	`arm_cm` real,
	`thigh_cm` real,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercise_muscles` (
	`exercise_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`exercise_id`, `category_id`),
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer,
	`equipment_id` integer,
	`name` text NOT NULL,
	`instructions` text,
	`technique_notes` text,
	`image_url` text,
	`difficulty_level` text,
	`tracking_type` text DEFAULT 'REPS' NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`garmin_category` text,
	`garmin_exercise_name` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `exercises_category_idx` ON `exercises` (`category_id`);--> statement-breakpoint
CREATE INDEX `exercises_equipment_idx` ON `exercises` (`equipment_id`);--> statement-breakpoint
CREATE TABLE `garmin_activity_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`garmin_activity_id` text,
	`avg_heart_rate` integer,
	`max_heart_rate` integer,
	`calories_burned` integer,
	`raw_garmin_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_activity_metrics_session_id_unique` ON `garmin_activity_metrics` (`session_id`);--> statement-breakpoint
CREATE TABLE `garmin_daily_health` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`summary_date` text NOT NULL,
	`resting_heart_rate` integer,
	`hrv_status` text,
	`hrv_avg_ms` integer,
	`stress_level` integer,
	`sleep_duration_minutes` integer,
	`sleep_score` integer,
	`blood_pressure_systolic` integer,
	`blood_pressure_diastolic` integer,
	`active_calories` integer,
	`raw_garmin_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_daily_health_summary_date_unique` ON `garmin_daily_health` (`summary_date`);--> statement-breakpoint
CREATE TABLE `logged_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`set_number` integer NOT NULL,
	`reps_completed` integer,
	`weight_kg` real,
	`duration_seconds` integer,
	`rpe` integer,
	`completed_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `logged_sets_session_idx` ON `logged_sets` (`session_id`);--> statement-breakpoint
CREATE INDEX `logged_sets_exercise_idx` ON `logged_sets` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `plan_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`order_index` integer NOT NULL,
	`target_sets` integer NOT NULL,
	`target_reps` integer,
	`target_weight` real,
	`target_duration_seconds` integer,
	`rest_duration_seconds` integer DEFAULT 90 NOT NULL,
	`notes` text,
	FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `plan_exercises_plan_idx` ON `plan_exercises` (`plan_id`);--> statement-breakpoint
CREATE TABLE `scheduled_workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`scheduled_date` text NOT NULL,
	`scheduled_time` text,
	`reminder_offset_minutes` integer,
	`notification_id` text,
	`is_completed` integer DEFAULT false NOT NULL,
	`garmin_synced` integer DEFAULT false NOT NULL,
	`garmin_workout_id` text,
	`garmin_schedule_id` text,
	FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scheduled_workouts_date_idx` ON `scheduled_workouts` (`scheduled_date`);--> statement-breakpoint
CREATE TABLE `workout_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`is_template` integer DEFAULT false NOT NULL,
	`source_template_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scheduled_id` integer,
	`plan_id` integer,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text,
	`total_duration_seconds` integer,
	`user_notes` text,
	`rpe_rating` integer,
	FOREIGN KEY (`scheduled_id`) REFERENCES `scheduled_workouts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workout_sessions_start_idx` ON `workout_sessions` (`start_time`);