-- Tabele skrytki na kopie zapasowe FormaSync.
--
-- `payload` to zaszyfrowana koperta JSON; serwer nie zna hasła i nie zagląda do środka.
--
-- `owner` to nazwa właściciela, a nie jego token ani adres e-mail: token da się wymienić
-- (wyciekł, zgubiłeś telefon), adres zmienić — i kopie mają to przeżyć. Serwer wpisuje tu
-- nazwę, którą sam wyprowadził z tokena; telefon nigdy nie podaje właściciela w żądaniu.

CREATE TABLE IF NOT EXISTS formasync_backups (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    owner      VARCHAR(64)     NOT NULL,
    created_at DATETIME        NOT NULL,
    device     VARCHAR(64)     NOT NULL DEFAULT '',
    size_bytes INT UNSIGNED    NOT NULL,
    payload    LONGBLOB        NOT NULL,
    PRIMARY KEY (id),
    -- Spis, pobranie i sprzątanie zawsze zaczynają się od właściciela, a idą po `id` malejąco.
    KEY owner_idx (owner, id),
    KEY created_at_idx (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Właściciele zarejestrowani e-mailem. Ci wpisani wprost w `config.php` nie mają tu wiersza —
-- ich nazwa stoi w konfiguracji i nie potrzebuje bazy.
--
-- `token_hash` to SHA-256 tokena, nie sam token: wyciek tej tabeli nie daje dostępu do kopii,
-- bo z hasza nie da się odtworzyć tokena, który trzeba przysłać w nagłówku.
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

-- Rejestracje w toku: adres podany w aplikacji czeka tu na klik w link z poczty.
--
-- Dwa osobne sekrety, oba trzymane haszem. `code_hash` należy do linku, który poszedł mailem —
-- klik nim wyłącznie potwierdza adres. `claim_hash` należy do telefonu, który rejestrację
-- zaczął, i tylko on odbiera gotowy token. Dlatego sam dostęp do skrzynki nie wystarcza, żeby
-- przejąć półkę, a wyciek tej tabeli nie wystarcza, żeby dokończyć cudzą rejestrację.
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
