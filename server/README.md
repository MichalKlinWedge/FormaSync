# Skrytka na kopie zapasowe FormaSync

Jeden plik PHP i jedna tabela MySQL. Telefon wysyła tu raz na dobę zaszyfrowaną kopię całej bazy
aplikacji; serwer przechowuje ją i potrafi oddać. Jedna skrytka obsługuje **wielu właścicieli** —
każdy ze swoim tokenem i swoją półką.

## Czego serwer nie wie

Kopia przychodzi **już zaszyfrowana hasłem, które znasz tylko Ty i Twój telefon**. Serwer widzi
nieczytelny blok bajtów — nie zna hasła, nie potrafi odczytać ani tętna, ani wagi, ani ciśnienia.
Włamanie na serwer albo wgląd administratora hostingu nie odsłania danych.

Odwrotna strona tej samej monety: **bez hasła kopie są bezużyteczne**. Nikt ich nie odzyska —
ani ja, ani Ty. Zapisz je gdzieś poza telefonem.

## Wielu właścicieli na jednej skrytce

`config.php` trzyma listę `tokens`: nazwa właściciela => jego token. **Właściciela serwer
wyprowadza z tokena i wyłącznie z niego** — telefon nie podaje go w żądaniu, bo takie pole każdy
mógłby sobie napisać i czytać cudze kopie.

Co z tego wynika dla każdego z osobna:

- spis (`?list=1`) pokazuje tylko własne kopie;
- cudzy numer kopii (`?id=N`) odpowiada tym samym `404 Nie ma takiej kopii`, co numer
  nieistniejący — po odpowiedzi nie da się nawet poznać, że ktoś inny coś tu trzyma;
- limity `keep` i `quota_bytes` liczą się **osobno dla każdego**. Limit wspólny byłby cichą
  kradzieżą historii: czterech ludzi wysyłających codziennie zostawiałoby sobie tydzień zamiast
  miesiąca.

Token przekazujesz kanałem, w którym nie zostaje na zawsze — **nie mailem**. Skrzynka to kopiarka:
zostaje w niej na lata, jedzie w kopie zapasowe, bywa przekazywana dalej.

Wymiana tokena (wyciekł, ktoś odchodzi) to jedna zmiana w `config.php`. Kopie zostają, bo w bazie
stoi **nazwa** właściciela, a nie jego token. Nazw za to nie zmieniaj — to one wiążą wiersze
z osobą.

Dopóki `invite_token` w `config.php` jest pusty, skrytka nie zna żadnego adresu e-mail, nie
rejestruje nikogo sama i nie wysyła poczty: właścicieli dopisujesz Ty, ręcznie, a na serwerze nie
leży **ani jedna dana osobowa** — tylko nieczytelny szyfrogram i nazwa, którą sam wymyśliłeś.
Niżej jest opisane, co się zmienia, gdy to włączysz.

## Rejestracja adresem e-mail (opcjonalna)

Bez niej każdego nowego człowieka musisz wpisać do `config.php` i przekazać mu token. Z nią
robi to sam — a Ty dostajesz w bazie czytelną etykietę i możliwość odezwania się do tych ludzi.
Włącza ją `invite_token`; cena jest opisana na końcu tej sekcji i warto ją znać przed decyzją.

Jak to idzie:

1. W aplikacji: *Ustawienia → Kopia na serwerze → Zarejestruj e-mailem*. Człowiek podaje adres
   skrytki, swój e-mail i **token zaproszenia**, który dostał od Ciebie. Telefon losuje przy tym
   własny sekret i wysyła na serwer wyłącznie jego hasz.
2. Serwer wysyła na podany adres list z jednorazowym linkiem. **Tokena w liście nie ma.**
3. Klik w link potwierdza adres i nic więcej — strona nie widzi tokena i nie ma go skąd wziąć.
4. Telefon naciska *Dokończ rejestrację*, pokazuje swój sekret i dopiero wtedy serwer wydaje
   token właściciela. Raz: zgłoszenie znika razem z wydaniem.

Dwa sekrety w dwóch kanałach, bo odpowiadają na dwa różne pytania. Link z poczty dowodzi, że ktoś
czyta tę skrzynkę. Sekret telefonu dowodzi, że to ten sam telefon, który rejestrację zaczął.
Wynika z tego, że **ani sam dostęp do skrzynki, ani sam wyciek bazy nie wystarczą**, żeby przejąć
czyjąś półkę — i że token nigdy nie trafia do poczty, która zostaje w skrzynce na lata.

### Co daje ponowna rejestracja tego samego adresu

Nowy token do **tej samej półki** — tak wygląda powrót po przeinstalowaniu aplikacji albo zmianie
telefonu. Stary token przestaje działać w tej samej chwili. Kopie zostają, bo w bazie stoi nazwa
właściciela, a nie jego token ani adres.

Trzeba to powiedzieć wprost, bo rejestracja wygląda jak zakładanie konta: **e-mail odzyskuje
token, nigdy hasło**. Token daje dostęp do półki, czyli do zaszyfrowanych kopert. Otwiera je
wyłącznie hasło i tu nie ma żadnej furtki — gdyby była, działałaby też dla kogoś obcego.

### Czego to kosztuje

- **Poczta musi wychodzić.** Na współdzielonym hostingu `mail()` bywa blokowany albo ląduje
  w spamie. Nadawca z `mail_from` powinien być w domenie serwera, a domena mieć poprawne SPF
  i DKIM. Jeśli list nie przychodzi, zacznij od sprawdzenia tego, a nie skrytki.
- **Na serwerze zaczynają leżeć adresy e-mail**, czyli dane osobowe cudzych ludzi — z wszystkim,
  co z tego wynika w RODO. Bez rejestracji nie leżało tam nic takiego.
- Każdy, kto zna token zaproszenia, może wywołać wysyłkę listu na dowolny adres. Stąd limit
  `max_registrations_per_hour` i stąd rada, żeby wymieniać ten token, gdy przestajesz zapraszać.

Jeśli zapraszasz trzy osoby i potrafisz przekazać im token Signalem, rejestracja e-mailem nie jest
Ci potrzebna — zostaw `invite_token` pusty.

## Dlaczego nie łączymy się z MySQL-em wprost z telefonu

Oznaczałoby to wystawienie portu 3306 na świat i trzymanie hasła do bazy w aplikacji, skąd da się
je wydobyć. Tutaj hasło do bazy nie opuszcza serwera, a telefon zna wyłącznie własny token, który
unieważnisz jedną zmianą w `config.php`.

Wymagania: **PHP 7.4 lub nowszy** z rozszerzeniem PDO MySQL oraz MySQL/MariaDB.

## Instalacja

1. Utwórz bazę (albo użyj istniejącej) i wczytaj tabele:

   ```bash
   mysql -u root -p formasync < schema.sql
   ```

   Powstaną trzy: kopie oraz dwie obsługujące rejestrację adresem e-mail. Te dwie stoją puste
   i nic nie kosztują, dopóki rejestracji nie włączysz.

2. Skopiuj konfigurację i uzupełnij:

   ```bash
   cp config.example.php config.php
   php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"   # token do wklejenia, po jednym na osobę
   ```

3. Wgraj `backup.php` i `config.php` do katalogu obsługiwanego przez serwer WWW — **dostępnego
   wyłącznie po HTTPS**. Po HTTP token leci otwartym tekstem, więc plik sam odmawia pracy.

4. W aplikacji: *Ustawienia → Kopia na serwerze* — wpisz adres (np.
   `https://twojserwer.pl/formasync/backup.php`) i swój token.

`config.php` jest w `.gitignore` i nie trafia do repozytorium.

### Dopisanie kolejnej osoby

Nowy wiersz w `tokens` i tyle — bez zmian w bazie i bez zmian w aplikacji. Ta osoba wpisuje
u siebie ten sam adres i swój token.

Albo, jeśli włączysz rejestrację e-mailem, dajesz jej tylko adres skrytki i token zaproszenia —
dalej radzi sobie sama.

## Przejście ze skrytki jednoosobowej

Jeśli skrytka już u Ciebie stoi w starszej, jednoosobowej wersji:

1. W `config.php` zamień pojedynczy `token` na listę `tokens` — z nazwą dla siebie, na przykład
   `'ja' => '<dotychczasowy token>'`. Token możesz zostawić ten sam, wtedy w aplikacji nie
   zmieniasz nic.
2. Podstaw tę nazwę w `migrate-owner.sql` (w przykładzie jest `ja`) i wczytaj plik:

   ```bash
   mysql -u root -p formasync < migrate-owner.sql
   ```

   Migracja dokłada kolumnę `owner` i przypisuje Ci wszystkie kopie, które już leżą w tabeli.

3. Jeśli chcesz rejestracji adresem e-mail, dołóż jeszcze dwie tabele:

   ```bash
   mysql -u root -p formasync < migrate-registration.sql
   ```

   Bez tego kroku kopie działają normalnie, a rejestracja odpowiada błędem — tabel, do których
   zagląda, po prostu nie ma.

Kolejność ma znaczenie tylko tyle, że między jednym a drugim krokiem skrytka odpowiada błędem —
`backup.php` bez listy `tokens` zatrzymuje się od razu i mówi dlaczego w logu serwera, zamiast
udawać, że wszystko jest w porządku.

## Sprawdzenie, że działa

```bash
curl -i -H "X-FormaSync-Token: TWÓJ_TOKEN" "https://twojserwer.pl/formasync/backup.php?list=1"
```

Pusta lista (`{"backups":[]}`) oznacza, że wszystko stoi jak trzeba. `401` to zły token, `400` —
połączenie po HTTP, `500` — błąd konfiguracji, którego szczegół (żeby nie wyszedł na zewnątrz)
trafia do logu błędów serwera WWW pod hasłem `FormaSync backup:`.

## Co robi

| Żądanie | Działanie |
| --- | --- |
| `POST backup.php` | przyjmuje kopię, zapisuje jako nowy wiersz, kasuje najstarsze ponad limit |
| `GET backup.php?list=1` | spis kopii: numer, data, urządzenie, rozmiar |
| `GET backup.php?id=N` | oddaje wskazaną kopię |
| `POST backup.php?register=1` | zgłoszenie adresu e-mail; wysyła na niego link (wymaga `invite_token`) |
| `GET backup.php?confirm=X` | klik z poczty: potwierdza adres; jedyne miejsce, które oddaje stronę HTML |
| `POST backup.php?claim=1` | telefon odbiera swój token, gdy adres jest już potwierdzony |

Każde żądanie dotyczy wyłącznie kopii właściciela, którego token przyszedł w nagłówku.

Trzymane jest **30 ostatnich kopii na osobę**, a nie jedna nadpisywana w kółko. Jedna kopia to
pułapka: uszkodzona albo pusta zamazałaby tę jedyną dobrą i wyszłoby to w dniu, w którym jest
potrzebna. Liczbę zmienia się w `config.php`, podobnie jak limit bajtów na osobę
(`quota_bytes`) — po jego przekroczeniu ustępują najstarsze kopie, a najnowsza zostaje zawsze.

## Kopia bezpieczeństwa samej skrytki

Tabela `formasync_backups` powinna wejść do zwykłej kopii Twojej bazy. Kopia trzymana wyłącznie
na jednym serwerze to nadal jedno miejsce, w którym da się stracić wszystko naraz.
