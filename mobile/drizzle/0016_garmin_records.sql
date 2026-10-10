CREATE TABLE `garmin_records` (
	`record_key` text PRIMARY KEY NOT NULL,
	`sport` text DEFAULT 'RUNNING' NOT NULL,
	`label` text NOT NULL,
	`distance_meters` real,
	`seconds` integer,
	`achieved_on` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
