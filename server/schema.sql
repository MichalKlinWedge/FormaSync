-- Jedna tabela na kopie zapasowe FormaSync.
-- `payload` to zaszyfrowana koperta JSON; serwer nie zna hasła i nie zagląda do środka.

CREATE TABLE IF NOT EXISTS formasync_backups (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    created_at DATETIME        NOT NULL,
    device     VARCHAR(64)     NOT NULL DEFAULT '',
    size_bytes INT UNSIGNED    NOT NULL,
    payload    LONGBLOB        NOT NULL,
    PRIMARY KEY (id),
    KEY created_at_idx (created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
