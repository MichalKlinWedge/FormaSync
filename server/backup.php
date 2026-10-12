<?php
/**
 * Skrytka na kopie zapasowe FormaSync.
 *
 * Telefon wysyła tu zaszyfrowaną kopię całej bazy. Serwer nie zna hasła i nie potrafi jej
 * odczytać — przechowuje nieczytelny blok i potrafi go oddać.
 *
 * Kopie:
 *   POST  backup.php            — przyjmuje kopię (ciało żądania = koperta JSON z aplikacji)
 *   GET   backup.php?list=1     — spis kopii: numer, data, rozmiar
 *   GET   backup.php?id=123     — oddaje wskazaną kopię
 *
 * Rejestracja adresem e-mail (opcjonalna, włącza ją `invite_token` w `config.php`):
 *   POST  backup.php?register=1 — zgłoszenie adresu; wysyła na niego link z potwierdzeniem
 *   GET   backup.php?confirm=X  — klik z poczty; potwierdza adres i tyle (strona dla człowieka)
 *   POST  backup.php?claim=1    — telefon odbiera swój token, gdy adres jest już potwierdzony
 *
 * Jedna skrytka obsługuje wielu właścicieli. Każde żądanie o kopie musi mieć nagłówek
 * `X-FormaSync-Token`, a **właściciela serwer wyprowadza z tokena i wyłącznie z niego** —
 * nigdy z pola przysłanego przez telefon, bo takie pole każdy może sobie napisać. Spis,
 * pobranie i limity dotyczą tylko własnych kopii; cudzych nie widać i nie da się ich nadpisać.
 *
 * Wszystko siedzi w jednym pliku, choć rejestracja to osobna sprawa od kopii: aplikacja zna
 * jeden adres i gdyby endpointy rozjechały się na dwa pliki, trzeba by jej podawać dwa —
 * czyli dać drugie miejsce na pomyłkę w zamian za czystszy katalog.
 *
 * Instalacja: patrz README.md obok.
 */

declare(strict_types=1);

$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
// Przeglądarka nie ma tu czego szukać poza stroną potwierdzenia; ta ustawia sobie swój typ.
header('X-Content-Type-Options: nosniff');

/** Odpowiedź i koniec. Bez typu zwrotnego `never`, żeby plik działał też na PHP 7.4. */
function respond(int $status, array $body)
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Błąd konfiguracji. Szczegół idzie do logu serwera, a nie do odpowiedzi: na zewnątrz nie ma
 * prawa wyjść nic o kształcie `config.php`.
 */
function misconfigured(string $detail)
{
    error_log('FormaSync backup: ' . $detail);
    respond(500, ['error' => 'Skrytka jest nieskonfigurowana — szczegół w logu serwera.']);
}

/**
 * Siatka pod każdym zapytaniem do bazy. Bez niej błąd SQL-a (choćby brak kolumny po
 * niewykonanej migracji) wychodził gołym pięćsetnym z serwera WWW: aplikacja pokazywała
 * „kod 500” i nic więcej, a treść wyjątku trafiała tam, gdzie akurat celuje `display_errors`.
 * Teraz szczegół idzie wyłącznie do logu, a telefon dostaje zdanie, od którego da się zacząć
 * szukanie.
 */
set_exception_handler(static function ($error) {
    error_log('FormaSync backup: ' . $error->getMessage());
    respond(500, ['error' => 'Serwer nie obsłużył żądania — szczegół w logu serwera.']);
});

/** Strona dla człowieka, który kliknął link z poczty. Jedyne miejsce, gdzie oddajemy HTML. */
function page(string $heading, string $text)
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    $safe = static function (string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    };
    echo '<!doctype html><html lang="pl"><head><meta charset="utf-8">'
        , '<meta name="viewport" content="width=device-width,initial-scale=1">'
        , '<title>FormaSync</title><style>'
        , 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
        , 'background:#121214;color:#ededef;font:16px/1.6 system-ui,sans-serif;padding:24px}'
        , 'main{max-width:30rem}h1{font-size:1.4rem;margin:0 0 .6rem}p{margin:0;color:#a0a0a8}'
        , '</style></head><body><main><h1>', $safe($heading), '</h1><p>', $safe($text)
        , '</p></main></body></html>';
    exit;
}

/** Hasz sekretu w postaci, w jakiej leży w bazie. Liczony z tekstu szesnastkowego, nie z bajtów. */
function secretHash(string $hex): string
{
    return hash('sha256', $hex);
}

/** Czy to 64 znaki szesnastkowe, czyli kształt naszych sekretów i haszy. */
function isHex64(string $value): bool
{
    return preg_match('/^[0-9a-f]{64}$/', $value) === 1;
}

/**
 * Ile godzin, po polsku: 1 godzinę, 2–4 godziny, 5–21 godzin, 22–24 godziny. Zdanie idzie do
 * listu, który czyta człowiek, a „ważny 24 godzin” czyta się jak maszynowy przekład.
 */
function hoursPhrase(int $hours): string
{
    if ($hours === 1) {
        return 'godzinę';
    }
    $last = $hours % 10;
    $lastTwo = $hours % 100;
    $word = $last >= 2 && $last <= 4 && ($lastTwo < 12 || $lastTwo > 14) ? 'godziny' : 'godzin';
    return sprintf('%d %s', $hours, $word);
}

/** Ciało żądania jako tablica. Puste albo niepoprawne kończy rozmowę. */
function jsonBody(): array
{
    $raw = file_get_contents('php://input');
    $body = $raw === false || $raw === '' ? null : json_decode($raw, true);
    if (!is_array($body)) {
        respond(400, ['error' => 'Żądanie nie jest poprawnym JSON-em.']);
    }
    return $body;
}

// HTTPS jest warunkiem, a nie zaleceniem: po HTTP token leci otwartym tekstem.
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
if (!$secure && empty($config['allow_insecure_http'])) {
    respond(400, ['error' => 'Ten punkt działa wyłącznie po HTTPS.']);
}

$tokens = $config['tokens'] ?? null;
if (!is_array($tokens)) {
    // Jednoosobowy config miał pojedynczy `token`. Mówimy to wprost, bo samo „zły token”
    // kazałoby szukać winy w aplikacji, gdy problem leży w pliku obok.
    misconfigured(isset($config['token'])
        ? 'config.php w starym formacie: zamień `token` na listę `tokens`. Patrz README.md.'
        : 'config.php nie ma listy `tokens`.');
}

// Listę sprawdzamy przy każdym żądaniu, bo literówka w `config.php` nie ma prawa objawić się
// dopiero cudzymi kopiami w spisie. Kilka operacji na łańcuchach nic tu nie waży.
foreach ($tokens as $name => $value) {
    if ((string) $name === '' || strlen((string) $name) > 64) {
        misconfigured('nazwa właściciela musi mieć od 1 do 64 znaków.');
    }
    if (strncmp((string) $name, 'u_', 2) === 0) {
        misconfigured(sprintf(
            'nazwa „%s” jest zarezerwowana: przedrostek `u_` należy do właścicieli zarejestrowanych e-mailem.',
            $name
        ));
    }
    // Krótki token to furtka nie tylko do własnej półki, ale i do cudzej — stąd dolny próg.
    if (!is_string($value) || strlen($value) < 20) {
        misconfigured(sprintf('token właściciela „%s” jest za krótki (minimum 20 znaków).', $name));
    }
}
if (count(array_unique(array_values($tokens))) !== count($tokens)) {
    misconfigured('dwóch właścicieli ma ten sam token — nie da się rozstrzygnąć, czyja jest kopia.');
}

$invite = (string) ($config['invite_token'] ?? '');
if ($tokens === [] && $invite === '') {
    misconfigured('ani jednego właściciela w `tokens`, ani `invite_token` — nikt nie zdoła tu nic zapisać.');
}

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_name']),
        $config['db_user'],
        $config['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false],
    );
} catch (PDOException $e) {
    // Treść wyjątku potrafi zawierać dane logowania do bazy — nie wysyłamy jej na zewnątrz.
    error_log('FormaSync backup: ' . $e->getMessage());
    respond(500, ['error' => 'Baza danych niedostępna.']);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$sentToken = (string) ($_SERVER['HTTP_X_FORMASYNC_TOKEN'] ?? '');

/* ------------------------------------------------------------------ rejestracja adresem e-mail */

/**
 * Potwierdzenie na podany adres. Link niesie **tylko** jednorazowy kod, który potwierdza adres;
 * tokena w poczcie nie ma i być nie może — skrzynka to kopiarka: zostaje w niej na lata, jedzie
 * w kopie zapasowe, bywa przekazywana dalej.
 */
function sendConfirmationMail(array $config, string $email, string $code, int $hours)
{
    $url = (string) ($config['confirm_url'] ?? '');
    if (preg_match('#^https://\S+$#', $url) !== 1) {
        misconfigured('`confirm_url` musi być pełnym adresem https do backup.php.');
    }
    $from = (string) ($config['mail_from'] ?? '');
    // Adres nadawcy wchodzi wprost do nagłówka, więc nie wolno mu nieść znaku nowej linii.
    // Adresat przeszedł już FILTER_VALIDATE_EMAIL, więc i on jest wolny od wstrzyknięcia.
    if (filter_var($from, FILTER_VALIDATE_EMAIL) === false) {
        misconfigured('`mail_from` musi być poprawnym adresem e-mail — stąd wychodzi potwierdzenie.');
    }

    $link = $url . (strpos($url, '?') === false ? '?' : '&') . 'confirm=' . $code;
    $text = implode("\n", [
        'Ktoś podał ten adres w aplikacji FormaSync, żeby zapisywać kopie zapasowe na serwerze.',
        '',
        'Potwierdź adres, otwierając ten link:',
        $link,
        '',
        sprintf('Link jest ważny %s.', hoursPhrase($hours)),
        '',
        'Jeśli to nie Ty, zignoruj tę wiadomość — bez kliknięcia nic się nie stanie.',
        'Samo kliknięcie też nie wystarcza, żeby ktoś obcy dostał się do kopii: token odbiera',
        'wyłącznie ten telefon, który rejestrację zaczął.',
    ]);
    $headers = implode("\r\n", [
        'From: FormaSync <' . $from . '>',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
    ]);
    // Temat w UTF-8 musi jechać zakodowany, inaczej część klientów pokaże krzaki.
    $subject = '=?UTF-8?B?' . base64_encode('FormaSync — potwierdź adres e-mail') . '?=';

    if (!mail($email, $subject, $text, $headers)) {
        error_log('FormaSync backup: nie udało się wysłać potwierdzenia na ' . $email);
        respond(502, ['error' => 'Serwer nie wysłał potwierdzenia. Sprawdź konfigurację poczty.']);
    }
}

/** Wolna nazwa dla nowego właściciela. Losowa, bo z adresu e-mail nie wolno jej wyprowadzać. */
function freeOwnerName(PDO $pdo): string
{
    $statement = $pdo->prepare('SELECT COUNT(*) FROM formasync_owners WHERE owner = ?');
    for ($attempt = 0; $attempt < 10; $attempt++) {
        $name = 'u_' . bin2hex(random_bytes(5));
        $statement->execute([$name]);
        if ((int) $statement->fetchColumn() === 0) {
            return $name;
        }
    }
    throw new RuntimeException('nie udało się wylosować wolnej nazwy właściciela.');
}

if ($method === 'POST' && isset($_GET['register'])) {
    if ($invite === '') {
        respond(403, ['error' => 'Rejestracja e-mailem jest tu wyłączona. Poproś administratora o token.']);
    }
    if (strlen($invite) < 20) {
        misconfigured('`invite_token` jest za krótki (minimum 20 znaków).');
    }
    if (!hash_equals($invite, $sentToken)) {
        respond(401, ['error' => 'Zły token zaproszenia.']);
    }

    $body = jsonBody();
    $email = strtolower(trim((string) ($body['email'] ?? '')));
    $claimHash = strtolower((string) ($body['claimHash'] ?? ''));
    if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || strlen($email) > 190) {
        respond(400, ['error' => 'Podaj poprawny adres e-mail.']);
    }
    if (!isHex64($claimHash)) {
        respond(400, ['error' => 'Zgłoszenie jest niepoprawne — zaktualizuj aplikację.']);
    }

    // Wygasłe zgłoszenia znikają przy każdej nowej rejestracji. Osobne sprzątanie w cronie
    // byłoby czwartą rzeczą do pamiętania przy instalacji.
    $pdo->prepare('DELETE FROM formasync_registrations WHERE expires_at < UTC_TIMESTAMP()')->execute();

    // Bezpiecznik na wypadek wycieku tokena zaproszenia: skrytka nie ma być armatą do spamu.
    $perHour = max(1, (int) ($config['max_registrations_per_hour'] ?? 20));
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM formasync_registrations
         WHERE created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)'
    );
    $statement->execute();
    if ((int) $statement->fetchColumn() >= $perHour) {
        respond(429, ['error' => 'Za dużo rejestracji w ostatniej godzinie. Spróbuj później.']);
    }

    // Zgłoszenie tego samego adresu zastępuje poprzednie: zgubiony albo przeoczony list nie ma
    // blokować drugiej próby na dobę.
    $pdo->prepare('DELETE FROM formasync_registrations WHERE email = ?')->execute([$email]);

    $hours = max(1, (int) ($config['registration_hours'] ?? 24));
    $code = bin2hex(random_bytes(32));
    // Termin ważności liczymy w PHP, a nie przez `INTERVAL ? HOUR`: parametr w środku interwału
    // różne wersje MySQL-a traktują różnie, a tu nie ma czego zyskać na sprycie.
    $expiresAt = gmdate('Y-m-d H:i:s', time() + $hours * 3600);
    $pdo->prepare(
        'INSERT INTO formasync_registrations (email, claim_hash, code_hash, created_at, expires_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(), ?)'
    )->execute([$email, $claimHash, secretHash($code), $expiresAt]);

    sendConfirmationMail($config, $email, $code, $hours);
    respond(202, ['status' => 'pending', 'hours' => $hours]);
}

if ($method === 'GET' && isset($_GET['confirm'])) {
    $code = strtolower((string) $_GET['confirm']);
    if (!isHex64($code)) {
        page('Ten link jest niepoprawny', 'Otwórz go jeszcze raz wprost z wiadomości, bez dopisywania niczego od siebie.');
    }

    $statement = $pdo->prepare(
        'UPDATE formasync_registrations SET confirmed_at = UTC_TIMESTAMP()
         WHERE code_hash = ? AND expires_at >= UTC_TIMESTAMP() AND confirmed_at IS NULL'
    );
    $statement->execute([secretHash($code)]);
    if ($statement->rowCount() > 0) {
        page(
            'Adres potwierdzony',
            'Wróć do aplikacji i naciśnij „Dokończ rejestrację”. Token zna wyłącznie ten telefon, '
            . 'z którego zacząłeś — ta strona go nie widziała i nie zobaczy.'
        );
    }

    // Brak zmienionego wiersza znaczy jedno z trzech: już potwierdzone, wygasłe albo zmyślone.
    // Rozróżniamy tylko pierwsze, bo przy dwóch pozostałych rada jest ta sama.
    $statement = $pdo->prepare(
        'SELECT 1 FROM formasync_registrations WHERE code_hash = ? AND confirmed_at IS NOT NULL'
    );
    $statement->execute([secretHash($code)]);
    if ($statement->fetchColumn() !== false) {
        page('Adres jest już potwierdzony', 'Nie musisz nic więcej robić tutaj — dokończ rejestrację w aplikacji.');
    }
    page(
        'Link jest nieważny',
        'Albo wygasł, albo nie jest tym, który przyszedł pocztą — nie mówimy którym, bo po takiej '
        . 'odpowiedzi dałoby się zgadywać cudze linki. Wróć do aplikacji i zarejestruj adres '
        . 'jeszcze raz; przyjdzie nowy list.'
    );
}

if ($method === 'POST' && isset($_GET['claim'])) {
    $body = jsonBody();
    $claim = strtolower((string) ($body['claim'] ?? ''));
    if (!isHex64($claim)) {
        respond(400, ['error' => 'Zgłoszenie jest niepoprawne — zaktualizuj aplikację.']);
    }

    $statement = $pdo->prepare(
        'SELECT id, email, confirmed_at FROM formasync_registrations
         WHERE claim_hash = ? AND expires_at >= UTC_TIMESTAMP()'
    );
    $statement->execute([secretHash($claim)]);
    $registration = $statement->fetch(PDO::FETCH_ASSOC);
    if ($registration === false) {
        respond(404, ['error' => 'Zgłoszenie wygasło albo zostało już odebrane. Zarejestruj adres jeszcze raz.']);
    }
    if ($registration['confirmed_at'] === null) {
        respond(202, ['status' => 'pending']);
    }

    $token = bin2hex(random_bytes(32));
    $pdo->beginTransaction();
    $statement = $pdo->prepare('SELECT owner FROM formasync_owners WHERE email = ?');
    $statement->execute([$registration['email']]);
    $existing = $statement->fetchColumn();
    if ($existing === false) {
        $owner = freeOwnerName($pdo);
        $pdo->prepare(
            'INSERT INTO formasync_owners (owner, email, token_hash, created_at)
             VALUES (?, ?, ?, UTC_TIMESTAMP())'
        )->execute([$owner, $registration['email'], secretHash($token)]);
    } else {
        // Znany adres, nowy token: tak wygląda odzyskanie dostępu po przeinstalowaniu aplikacji
        // albo zmianie telefonu. Półka zostaje ta sama, bo w kopiach stoi nazwa, nie token.
        $owner = (string) $existing;
        $pdo->prepare('UPDATE formasync_owners SET token_hash = ? WHERE email = ?')
            ->execute([secretHash($token), $registration['email']]);
    }
    // Zgłoszenie znika razem z wydaniem tokena: jeden klik w poczcie wydaje go dokładnie raz.
    $pdo->prepare('DELETE FROM formasync_registrations WHERE id = ?')->execute([(int) $registration['id']]);
    $pdo->commit();

    respond(200, ['token' => $token, 'owner' => $owner]);
}

/* ------------------------------------------------------------------------------------- kopie */

/**
 * Właściciel stojący za tokenem albo `null`.
 *
 * Najpierw lista z `config.php`: przechodzimy ją całą nawet po trafieniu, bo wyjście w pół drogi
 * mówiłoby czasem odpowiedzi, na którym miejscu listy stoi token. Potem baza — tam szukamy po
 * haszu, więc nie leży w niej nic, czym dałoby się podszyć pod właściciela.
 */
function resolveOwner(PDO $pdo, array $tokens, string $token)
{
    $owner = null;
    foreach ($tokens as $name => $expected) {
        // hash_equals porównuje w stałym czasie — zwykłe === pozwalałoby zgadywać token
        // po milisekundach.
        if (hash_equals((string) $expected, $token)) {
            $owner = (string) $name;
        }
    }
    if ($owner !== null || $token === '') {
        return $owner;
    }

    $statement = $pdo->prepare('SELECT owner FROM formasync_owners WHERE token_hash = ?');
    $statement->execute([secretHash($token)]);
    $found = $statement->fetchColumn();
    return $found === false ? null : (string) $found;
}

$owner = resolveOwner($pdo, $tokens, $sentToken);
if ($owner === null) {
    respond(401, ['error' => 'Zły token.']);
}

if ($method === 'POST') {
    $payload = file_get_contents('php://input');
    if ($payload === false || $payload === '') {
        respond(400, ['error' => 'Puste żądanie.']);
    }
    $limit = (int) $config['max_bytes'];
    if (strlen($payload) > $limit) {
        respond(413, ['error' => sprintf('Kopia większa niż %d bajtów.', $limit)]);
    }
    // Pusta albo obcięta kopia nie ma prawa wyprzeć dobrych — koperta musi być poprawnym JSON-em.
    $envelope = json_decode($payload, true);
    if (!is_array($envelope) || ($envelope['app'] ?? null) !== 'FormaSync') {
        respond(400, ['error' => 'To nie jest kopia FormaSync.']);
    }

    $pdo->prepare(
        // Czas zapisujemy w UTC: spis kopii podaje go ze znacznikiem „Z”, a telefon przelicza
        // na swoją strefę. Zwykłe NOW() zapisałoby czas lokalny serwera i daty wyszłyby
        // przesunięte o tyle, ile wynosi różnica stref.
        'INSERT INTO formasync_backups (owner, created_at, device, size_bytes, payload)
         VALUES (?, UTC_TIMESTAMP(), ?, ?, ?)'
    )->execute([
        $owner,
        substr((string) ($envelope['device'] ?? ''), 0, 64),
        strlen($payload),
        $payload,
    ]);
    $id = (int) $pdo->lastInsertId();

    // Zostawiamy ostatnie N kopii **tego właściciela**. Limit wspólny dla wszystkich byłby
    // cichą kradzieżą historii: czterech ludzi wysyłających codziennie zostawiałoby sobie
    // tydzień zamiast miesiąca. Jedna kopia nadpisywana w kółko też jest pułapką — uszkodzona
    // zamazałaby jedyną dobrą i wyszłoby to w dniu, w którym jest potrzebna.
    $keep = max(1, (int) $config['keep']);
    $pdo->prepare(
        // OFFSET jest równy `keep`, a nie `keep - 1`: szukamy **pierwszej kopii za limitem**,
        // bo `id <=` kasuje też ten znaleziony wiersz. Przy `keep - 1` trafialibyśmy w ostatnią
        // kopię do zachowania i ginęłaby razem ze starszymi — półka trzymałaby o jedną mniej,
        // niż mówi konfiguracja. Gdy kopii jest najwyżej `keep`, podzapytanie nie zwraca nic,
        // `id <= NULL` nie wybiera żadnego wiersza i nic się nie kasuje.
        'DELETE FROM formasync_backups WHERE owner = ? AND id <= (
            SELECT id FROM (
                SELECT id FROM formasync_backups WHERE owner = ? ORDER BY id DESC LIMIT 1 OFFSET ?
            ) AS cutoff
        )'
    )->execute([$owner, $owner, $keep]);

    // Drugi limit, na bajty: sam licznik kopii nie pilnuje dysku, bo kopia rośnie z historią
    // treningów i ze zdjęciami ćwiczeń.
    $quota = (int) ($config['quota_bytes'] ?? 0);
    if ($quota > 0) {
        $statement = $pdo->prepare(
            'SELECT id, size_bytes FROM formasync_backups WHERE owner = ? ORDER BY id ASC'
        );
        $statement->execute([$owner]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
        $used = array_sum(array_map(static function (array $row): int {
            return (int) $row['size_bytes'];
        }, $rows));
        $drop = $pdo->prepare('DELETE FROM formasync_backups WHERE id = ?');
        // Najstarsze ustępują, dopóki półka nie zmieści się w limicie. Najnowsza zostaje zawsze:
        // po świeżej wysyłce to właśnie ona jest tą, której nie wolno stracić — choćby sama
        // przekraczała limit.
        foreach (array_slice($rows, 0, -1) as $row) {
            if ($used <= $quota) {
                break;
            }
            $drop->execute([(int) $row['id']]);
            $used -= (int) $row['size_bytes'];
        }
    }

    respond(201, ['id' => $id, 'size' => strlen($payload)]);
}

if ($method === 'GET' && isset($_GET['list'])) {
    $statement = $pdo->prepare(
        'SELECT id, created_at, device, size_bytes FROM formasync_backups
         WHERE owner = ? ORDER BY id DESC'
    );
    $statement->execute([$owner]);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
    respond(200, ['backups' => array_map(static function (array $row): array {
        return [
            'id' => (int) $row['id'],
            'createdAt' => str_replace(' ', 'T', $row['created_at']) . 'Z',
            'device' => $row['device'],
            'size' => (int) $row['size_bytes'],
        ];
    }, $rows)]);
}

if ($method === 'GET' && isset($_GET['id'])) {
    // Warunek na właściciela nie jest ozdobą: numery kopii idą jednym ciągiem przez całą
    // tabelę, więc bez niego wystarczyłoby policzyć do sąsiada. Cudzy numer odpowiada tym
    // samym „nie ma takiej kopii”, co numer nieistniejący — po odpowiedzi nie da się poznać,
    // że ktoś inny coś tu trzyma.
    $statement = $pdo->prepare('SELECT payload FROM formasync_backups WHERE id = ? AND owner = ?');
    $statement->execute([(int) $_GET['id'], $owner]);
    $payload = $statement->fetchColumn();
    if ($payload === false) {
        respond(404, ['error' => 'Nie ma takiej kopii.']);
    }
    http_response_code(200);
    echo $payload;
    exit;
}

respond(405, ['error' => 'Nieobsługiwane żądanie.']);
