ALTER TABLE `exercises` ADD `unilateral` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `logged_sets` ADD `side` text;--> statement-breakpoint
UPDATE `exercises` SET `unilateral` = 1 WHERE `name` IN ('Wiosłowanie hantlem jednorącz', 'Przysiad bułgarski z hantlami', 'Martwy ciąg rumuński jednonóż z hantlami', 'Deska boczna', 'Unoszenie ramienia bokiem na wyciągu', 'Wejścia na skrzynię z hantlami', 'Prostowanie biodra na wyciągu');
