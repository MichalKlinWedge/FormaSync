CREATE TABLE `meal_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`logged_at` text NOT NULL,
	`day_key` text NOT NULL,
	`meal` text DEFAULT 'SNACK' NOT NULL,
	`title` text NOT NULL,
	`grams` real,
	`kcal` integer NOT NULL,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real
);
--> statement-breakpoint
CREATE INDEX `meal_logs_day_idx` ON `meal_logs` (`day_key`);