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

    /**
     * Rejestracja adresem e-mail. Pusty łańcuch ją **wyłącza** — wtedy skrytka nie zna żadnego
     * adresu e-mail i nie wysyła poczty, a właścicieli dopisujesz wyłącznie wyżej, ręcznie.
     *
     * Token zaproszenia jest wspólny i służy do jednego: żeby rejestracji nie mógł rozpocząć
     * każdy, kto zna adres skrytki. Rozdajesz go osobom, które zapraszasz, a gdy przestajesz
     * zapraszać — zmieniasz. Wymiana nie rusza nikogo, kto już się zarejestrował.
     */
    'invite_token' => '',

    // Pełny adres https do tego pliku. Z niego powstaje link w liście z potwierdzeniem, więc
    // nie da się go wziąć z samego żądania: za proxy adres bywa inny, niż widzi PHP.
    'confirm_url' => 'https://twojserwer.pl/formasync/backup.php',

    // Nadawca potwierdzeń. Najlepiej adres w domenie serwera — list z obcej domeny trafia
    // do spamu albo nie wychodzi wcale.
    'mail_from' => 'formasync@twojserwer.pl',

    // Ile godzin ważny jest link z potwierdzeniem.
    'registration_hours' => 24,

    // Bezpiecznik na wypadek wycieku tokena zaproszenia: skrytka nie ma być armatą do spamu.
    'max_registrations_per_hour' => 20,

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
