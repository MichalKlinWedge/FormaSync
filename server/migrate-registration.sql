-- Migracja: rejestracja właścicieli adresem e-mail.
--
-- Dokłada dwie tabele. Nie tyka `formasync_backups` ani niczego, co już w niej leży — właściciele
-- wpisani wprost w `config.php` działają dalej bez zmian, a zarejestrowani dostają własne nazwy
-- z przedrostkiem `u_`.
--
-- Uruchom po `migrate-owner.sql`:
--
--   mysql -u root -p formasync < migrate-registration.sql

CREATE TABLE IF NOT EXISTS formasync_owners (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    owner      VARCHAR(64)     NOT NULL,
    email      VARCHAR(190)    NOT NULL,
    token_hash CHAR(64)        NOT NULL,
    created_at DATETIME        NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY owner_uq (owner),
    UNIQUE KEY email_uq (email),
    UNIQUE KEY token_hash_uq (token_hash)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS formasync_registrations (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email        VARCHAR(190)    NOT NULL,
    claim_hash   CHAR(64)        NOT NULL,
    code_hash    CHAR(64)        NOT NULL,
    created_at   DATETIME        NOT NULL,
    expires_at   DATETIME        NOT NULL,
    confirmed_at DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY claim_hash_uq (claim_hash),
    UNIQUE KEY code_hash_uq (code_hash),
    KEY email_idx (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
