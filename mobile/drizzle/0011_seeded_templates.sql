CREATE TABLE `seeded_templates` (
	`title` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
-- Szablony, które już są w bazie, wgrał seed. Zapisujemy je jako dostarczone, żeby po usunięciu
-- albo przerobieniu nie wróciły przy najbliższym podbiciu SEED_VERSION.
INSERT OR IGNORE INTO `seeded_templates` (`title`) SELECT `title` FROM `workout_plans` WHERE `is_template` = 1;
