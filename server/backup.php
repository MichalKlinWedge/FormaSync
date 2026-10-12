<?php
/**
 * Skrytka na kopie zapasowe FormaSync.
 *
 * Telefon wysyła tu zaszyfrowaną kopię całej bazy. Serwer nie zna hasła i nie potrafi jej
 * odczytać — przechowuje nieczytelny blok i potrafi go oddać. Celowo nie ma tu nic więcej:
 * im mniej ten plik umie, tym mniej da się przez niego zepsuć.
 *
 * POST  backup.php            — przyjmuje kopię (ciało żądania = koperta JSON z aplikacji)
 * GET   backup.php?list=1     — spis kopii: numer, data, rozmiar
 * GET   backup.php?id=123     — oddaje wskazaną kopię
 *
 * Jedna skrytka obsługuje wielu właścicieli. Każde żądanie musi mieć nagłówek
 * `X-FormaSync-Token` z tokenem jednego z nich, a **właściciela serwer wyprowadza z tokena
 * i wyłącznie z niego** — nigdy z pola przysłanego przez telefon, bo takie pole każdy może
 * sobie napisać. Spis, pobranie i limity dotyczą tylko własnych kopii; cudzych nie widać
 * i nie da się ich nadpisać.
 *
 * Instalacja: patrz README.md obok.
 */

declare(strict_types=1);

$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
// Przeglądarka nie ma tu czego szukać; to punkt wyłącznie dla aplikacji.
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

// HTTPS jest warunkiem, a nie zaleceniem: po HTTP token leci otwartym tekstem.
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
if (!$secure && empty($config['allow_insecure_http'])) {
    respond(400, ['error' => 'Ten punkt działa wyłącznie po HTTPS.']);
}

$tokens = $config['tokens'] ?? null;
if (!is_array($tokens) || $tokens === []) {
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
    // Krótki token to furtka nie tylko do własnej półki, ale i do cudzej — stąd dolny próg.
    if (!is_string($value) || strlen($value) < 20) {
        misconfigured(sprintf('token właściciela „%s” jest za krótki (minimum 20 znaków).', $name));
    }
}
if (count(array_unique(array_values($tokens))) !== count($tokens)) {
    misconfigured('dwóch właścicieli ma ten sam token — nie da się rozstrzygnąć, czyja jest kopia.');
}

/**
 * Właściciel stojący za tokenem albo `null`. Przechodzimy całą listę nawet po trafieniu:
 * wyjście w pół drogi mówiłoby czasem odpowiedzi, na którym miejscu listy stoi token.
 */
function resolveOwner(array $tokens, string $token)
{
    $owner = null;
    foreach ($tokens as $name => $expected) {
        if (hash_equals((string) $expected, $token)) {
            $owner = (string) $name;
        }
    }
    return $owner;
}

// hash_equals porównuje w stałym czasie — zwykłe === pozwalałoby zgadywać token po milisekundach.
$owner = resolveOwner($tokens, $_SERVER['HTTP_X_FORMASYNC_TOKEN'] ?? '');
if ($owner === null) {
    respond(401, ['error' => 'Zły token.']);
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
