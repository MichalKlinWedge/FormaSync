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
 * Każde żądanie musi mieć nagłówek `X-FormaSync-Token` zgodny z tokenem z konfiguracji.
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

// HTTPS jest warunkiem, a nie zaleceniem: po HTTP token leci otwartym tekstem.
$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
if (!$secure && empty($config['allow_insecure_http'])) {
    respond(400, ['error' => 'Ten punkt działa wyłącznie po HTTPS.']);
}

$token = $_SERVER['HTTP_X_FORMASYNC_TOKEN'] ?? '';
// hash_equals porównuje w stałym czasie — zwykłe === pozwalałoby zgadywać token po milisekundach.
if ($token === '' || !hash_equals((string) $config['token'], $token)) {
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
        'INSERT INTO formasync_backups (created_at, device, size_bytes, payload) VALUES (NOW(), ?, ?, ?)'
    )->execute([
        substr((string) ($envelope['device'] ?? ''), 0, 64),
        strlen($payload),
        $payload,
    ]);
    $id = (int) $pdo->lastInsertId();

    // Zostawiamy ostatnie N kopii. Jedna nadpisywana w kółko byłaby pułapką: uszkodzona
    // kopia zamazałaby jedyną dobrą i wyszłoby to dopiero w dniu, w którym jest potrzebna.
    $keep = max(1, (int) $config['keep']);
    $pdo->prepare(
        'DELETE FROM formasync_backups WHERE id <= (
            SELECT id FROM (
                SELECT id FROM formasync_backups ORDER BY id DESC LIMIT 1 OFFSET ?
            ) AS cutoff
        )'
    )->execute([$keep - 1]);

    respond(201, ['id' => $id, 'size' => strlen($payload)]);
}

if ($method === 'GET' && isset($_GET['list'])) {
    $rows = $pdo
        ->query('SELECT id, created_at, device, size_bytes FROM formasync_backups ORDER BY id DESC')
        ->fetchAll(PDO::FETCH_ASSOC);
    respond(200, ['backups' => array_map(static fn (array $row): array => [
        'id' => (int) $row['id'],
        'createdAt' => str_replace(' ', 'T', $row['created_at']) . 'Z',
        'device' => $row['device'],
        'size' => (int) $row['size_bytes'],
    ], $rows)]);
}

if ($method === 'GET' && isset($_GET['id'])) {
    $statement = $pdo->prepare('SELECT payload FROM formasync_backups WHERE id = ?');
    $statement->execute([(int) $_GET['id']]);
    $payload = $statement->fetchColumn();
    if ($payload === false) {
        respond(404, ['error' => 'Nie ma takiej kopii.']);
    }
    http_response_code(200);
    echo $payload;
    exit;
}

respond(405, ['error' => 'Nieobsługiwane żądanie.']);
