# Skrytka na kopie zapasowe FormaSync

Jeden plik PHP i jedna tabela MySQL. Telefon wysyła tu raz na dobę zaszyfrowaną kopię całej bazy
aplikacji; serwer przechowuje ją i potrafi oddać.

## Czego serwer nie wie

Kopia przychodzi **już zaszyfrowana hasłem, które znasz tylko Ty i Twój telefon**. Serwer widzi
nieczytelny blok bajtów — nie zna hasła, nie potrafi odczytać ani tętna, ani wagi, ani ciśnienia.
Włamanie na serwer albo wgląd administratora hostingu nie odsłania danych.

Odwrotna strona tej samej monety: **bez hasła kopie są bezużyteczne**. Nikt ich nie odzyska —
ani ja, ani Ty. Zapisz je gdzieś poza telefonem.

## Dlaczego nie łączymy się z MySQL-em wprost z telefonu

Oznaczałoby to wystawienie portu 3306 na świat i trzymanie hasła do bazy w aplikacji, skąd da się
je wydobyć. Tutaj hasło do bazy nie opuszcza serwera, a telefon zna wyłącznie własny token, który
unieważnisz jedną zmianą w `config.php`.

Wymagania: **PHP 7.4 lub nowszy** z rozszerzeniem PDO MySQL oraz MySQL/MariaDB.

## Instalacja

1. Utwórz bazę (albo użyj istniejącej) i wczytaj tabelę:

   ```bash
   mysql -u root -p formasync < schema.sql
   ```

2. Skopiuj konfigurację i uzupełnij:

   ```bash
   cp config.example.php config.php
   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"   # token do wklejenia
   ```

3. Wgraj `backup.php` i `config.php` do katalogu obsługiwanego przez serwer WWW — **dostępnego
   wyłącznie po HTTPS**. Po HTTP token leci otwartym tekstem, więc plik sam odmawia pracy.

4. W aplikacji: *Ustawienia → Kopia na serwerze* — wpisz adres (np.
   `https://twojserwer.pl/formasync/backup.php`) i token.

`config.php` jest w `.gitignore` i nie trafia do repozytorium.

## Sprawdzenie, że działa

```bash
curl -i -H "X-FormaSync-Token: TWÓJ_TOKEN" "https://twojserwer.pl/formasync/backup.php?list=1"
```

Pusta lista (`{"backups":[]}`) oznacza, że wszystko stoi jak trzeba. `401` to zły token, `400` —
połączenie po HTTP.

## Co robi

| Żądanie | Działanie |
| --- | --- |
| `POST backup.php` | przyjmuje kopię, zapisuje jako nowy wiersz, kasuje najstarsze ponad limit |
| `GET backup.php?list=1` | spis kopii: numer, data, urządzenie, rozmiar |
| `GET backup.php?id=N` | oddaje wskazaną kopię |

Trzymane jest **30 ostatnich kopii**, a nie jedna nadpisywana w kółko. Jedna kopia to pułapka:
uszkodzona albo pusta zamazałaby tę jedyną dobrą i wyszłoby to w dniu, w którym jest potrzebna.
Liczbę zmienia się w `config.php`.

## Kopia bezpieczeństwa samej skrytki

Tabela `formasync_backups` powinna wejść do zwykłej kopii Twojej bazy. Kopia trzymana wyłącznie
na jednym serwerze to nadal jedno miejsce, w którym da się stracić wszystko naraz.
