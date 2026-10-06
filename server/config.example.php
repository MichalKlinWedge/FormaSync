<?php
/**
 * Konfiguracja skrytki na kopie. Skopiuj ten plik jako `config.php` i uzupełnij.
 * `config.php` nie trafia do repozytorium — zawiera dane logowania do bazy.
 */

return [
    // Losowy, długi token. Ten sam wpisujesz w aplikacji. Wygeneruj go np. poleceniem:
    //   php -r "echo bin2hex(random_bytes(32));"
    'token' => 'WKLEJ_TU_WYGENEROWANY_TOKEN',

    'db_host' => 'localhost',
    'db_name' => 'formasync',
    'db_user' => 'formasync',
    'db_pass' => '',

    // Ile ostatnich kopii trzymać.
    'keep' => 30,

    // Górny limit rozmiaru jednej kopii. Zwykła kopia to kilkaset kilobajtów.
    'max_bytes' => 20 * 1024 * 1024,

    // Zostaw false. true tylko do próby na localhoście — po HTTP token leci otwartym tekstem.
    'allow_insecure_http' => false,
];
