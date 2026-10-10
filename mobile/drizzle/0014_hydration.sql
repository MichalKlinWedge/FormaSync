CREATE TABLE `hydration_days` (
	`day_key` text PRIMARY KEY NOT NULL,
	`extra_ml` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hydration_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logged_at` text NOT NULL,
	`day_key` text NOT NULL,
	`milliliters` integer NOT NULL,
	`source` text DEFAULT 'APP' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hydration_logs_day_idx` ON `hydration_logs` (`day_key`);