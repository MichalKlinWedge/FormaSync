-- Trening wczytany z zegarka na zaplanowany termin brał nazwę od Garmina („Kardio”), choć
-- w kalendarzu stał konkretny plan („Taniec 60 minut”). Takie wpisy przejmują plan terminu,
-- a ich tytuł zostaje pusty — wtedy historia pokazuje nazwę planu.
--
-- Ruszamy wyłącznie treningi, które jednocześnie: wiszą na terminie, nie mają jeszcze planu
-- i powstały z aktywności z zegarka. Trening prowadzony w aplikacji ma już plan, a nazwany
-- ręcznie nie ma powiązanej aktywności.
UPDATE `workout_sessions`
SET `plan_id` = (
      SELECT `plan_id` FROM `scheduled_workouts` WHERE `scheduled_workouts`.`id` = `workout_sessions`.`scheduled_id`
    ),
    `title` = NULL
WHERE `scheduled_id` IS NOT NULL
  AND `plan_id` IS NULL
  AND EXISTS (
    SELECT 1 FROM `garmin_activity_metrics`
    WHERE `garmin_activity_metrics`.`session_id` = `workout_sessions`.`id`
      AND `garmin_activity_metrics`.`garmin_activity_id` IS NOT NULL
  );
