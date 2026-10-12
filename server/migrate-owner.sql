-- Migracja skrytki jednoosobowej na wieloosobową.
--
-- Uruchom raz, na istniejącej tabeli `formasync_backups`. Kopie, które już w niej leżą, trafiają
-- do jednego właściciela — **podstaw niżej nazwę, pod jaką wpiszesz swój token w `config.php`**
-- (w przykładzie: `ja`). Nazwa musi być dokładnie ta sama, inaczej aplikacja nie zobaczy
-- dotychczasowych kopii.
--
--   mysql -u root -p formasync < migrate-owner.sql

ALTER TABLE formasync_backups
    ADD COLUMN owner VARCHAR(64) NOT NULL DEFAULT '' AFTER id,
    ADD KEY owner_idx (owner, id);

UPDATE formasync_backups SET owner = 'ja' WHERE owner = '';

-- Domyślna pustka była potrzebna tylko po to, żeby stare wiersze miały co wpisać.
-- Dalej właściciel jest obowiązkowy.
ALTER TABLE formasync_backups MODIFY COLUMN owner VARCHAR(64) NOT NULL;
