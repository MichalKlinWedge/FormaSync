-- Jedna tabela na kopie zapasowe FormaSync.
-- `payload` to zaszyfrowana koperta JSON; serwer nie zna hasła i nie zagląda do środka.
--
-- `owner` to nazwa właściciela z `config.php`, a nie jego token: token da się wymienić
-- (wyciekł, zmieniłeś telefon) i kopie mają to przeżyć. Serwer wpisuje tu nazwę, którą sam
-- wyprowadził z tokena — telefon nigdy nie podaje właściciela w żądaniu.

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
