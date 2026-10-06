-- Wbudowany szablon pływacki powstał, zanim odcinki miały styl. Dopisujemy go, żeby pokazywał
-- to, co aplikacja potrafi; dotyczy wyłącznie szablonu, nie planów użytkownika.
UPDATE `plan_segments` SET `stroke` = 'ANY'
WHERE `stroke` IS NULL AND `kind` = 'WARMUP' AND `plan_id` IN (
  SELECT `id` FROM `workout_plans` WHERE `is_template` = 1 AND `sport` = 'SWIMMING'
);--> statement-breakpoint
UPDATE `plan_segments` SET `stroke` = 'FREE'
WHERE `stroke` IS NULL AND `kind` = 'WORK' AND `plan_id` IN (
  SELECT `id` FROM `workout_plans` WHERE `is_template` = 1 AND `sport` = 'SWIMMING'
);--> statement-breakpoint
UPDATE `plan_segments` SET `stroke` = 'BACKSTROKE'
WHERE `stroke` IS NULL AND `kind` = 'COOLDOWN' AND `plan_id` IN (
  SELECT `id` FROM `workout_plans` WHERE `is_template` = 1 AND `sport` = 'SWIMMING'
);
