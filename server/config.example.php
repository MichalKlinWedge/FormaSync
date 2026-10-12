<?php
/**
 * Konfiguracja skrytki na kopie. Skopiuj ten plik jako `config.php` i uzupełnij.
 * `config.php` nie trafia do repozytorium — zawiera dane logowania do bazy.
 */

return [
    /**
     * Właściciele kopii: nazwa => token. Każda osoba ma własny token i widzi wyłącznie własne
     * kopie — nazwa jest tylko etykietą w bazie, żeby dało się poznać, czyja jest która.
     *
     * Token generujesz Ty i przekazujesz tej osobie kanałem, w którym nie zostaje na zawsze
     * (nie mailem). W aplikacji wpisuje go w *Ustawienia → Kopia na serwerze*.
     *
     *   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
     *
     * Token da się wymienić bez utraty kopii: w bazie stoi nazwa właściciela, nie token.
     * Nazwy **nie zmieniaj** — to ona wiąże wiersze z osobą.
     */
    'tokens' => [
        'ja' => 'WKLEJ_TU_WYGENEROWANY_TOKEN',
        // 'anna' => 'TOKEN_ANNY',
    ],

    'db_host' => 'localhost',
    'db_name' => 'formasync',
    'db_user' => 'formasync',
    'db_pass' => '',

    // Ile ostatnich kopii trzymać **dla każdego właściciela osobno**.
    'keep' => 30,

    // Górny limit rozmiaru jednej kopii. Zwykła kopia to kilkaset kilobajtów.
    'max_bytes' => 20 * 1024 * 1024,

    /**
     * Ile bajtów wolno zająć jednemu właścicielowi razem. Po przekroczeniu ustępują najstarsze
     * kopie — najnowsza zostaje zawsze. Sam licznik `keep` nie pilnuje dysku, bo kopia rośnie
     * z historią treningów i ze zdjęciami ćwiczeń. 0 wyłącza limit.
     */
    'quota_bytes' => 200 * 1024 * 1024,

    // Zostaw false. true tylko do próby na localhoście — po HTTP token leci otwartym tekstem.
    'allow_insecure_http' => false,
];
