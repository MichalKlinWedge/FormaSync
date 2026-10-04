ALTER TABLE `workout_plans` ADD `sport` text DEFAULT 'STRENGTH' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD `sport` text DEFAULT 'STRENGTH' NOT NULL;