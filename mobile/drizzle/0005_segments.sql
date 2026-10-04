CREATE TABLE `logged_segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`session_segment_id` integer NOT NULL,
	`order_index` integer NOT NULL,
	`iteration` integer DEFAULT 1 NOT NULL,
	`distance_meters` real,
	`duration_seconds` integer,
	`avg_heart_rate` integer,
	`completed_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_segment_id`) REFERENCES `session_segments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `logged_segments_session_idx` ON `logged_segments` (`session_id`);--> statement-breakpoint
CREATE TABLE `plan_segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`parent_id` integer,
	`order_index` integer NOT NULL,
	`kind` text NOT NULL,
	`repeat_count` integer,
	`duration_type` text DEFAULT 'OPEN' NOT NULL,
	`distance_meters` real,
	`duration_seconds` integer,
	`target_type` text DEFAULT 'NONE' NOT NULL,
	`target_low` real,
	`target_high` real,
	`notes` text,
	FOREIGN KEY (`plan_id`) REFERENCES `workout_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_segments_plan_idx` ON `plan_segments` (`plan_id`);--> statement-breakpoint
CREATE TABLE `session_segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`parent_id` integer,
	`order_index` integer NOT NULL,
	`kind` text NOT NULL,
	`repeat_count` integer,
	`duration_type` text DEFAULT 'OPEN' NOT NULL,
	`distance_meters` real,
	`duration_seconds` integer,
	`target_type` text DEFAULT 'NONE' NOT NULL,
	`target_low` real,
	`target_high` real,
	`notes` text,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_segments_session_idx` ON `session_segments` (`session_id`);