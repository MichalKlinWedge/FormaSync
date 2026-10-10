CREATE TABLE `goal_workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goal_id` integer NOT NULL,
	`week_index` integer NOT NULL,
	`phase` text NOT NULL,
	`planned_date` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`distance_meters` real,
	`duration_seconds` integer,
	`pace_seconds` integer,
	`notes` text,
	`plan_id` integer,
	`scheduled_id` integer,
	FOREIGN KEY (`goal_id`) REFERENCES `training_goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`scheduled_id`) REFERENCES `scheduled_workouts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `goal_workouts_goal_idx` ON `goal_workouts` (`goal_id`);--> statement-breakpoint
CREATE INDEX `goal_workouts_date_idx` ON `goal_workouts` (`planned_date`);--> statement-breakpoint
CREATE TABLE `training_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sport` text DEFAULT 'RUNNING' NOT NULL,
	`title` text NOT NULL,
	`event_date` text NOT NULL,
	`distance_meters` real NOT NULL,
	`target_seconds` integer,
	`week_days` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`planned_by` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
