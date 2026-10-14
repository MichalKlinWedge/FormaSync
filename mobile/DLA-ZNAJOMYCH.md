# FormaSync dla znajomych

Co rozdać, komu i czym to potem aktualizować. Techniczna strona kanałów jest w
[README.md](README.md) — tutaj jest to, co trafia do człowieka.

## Skąd wziąć plik

```bash
npm run apk:friends
```

Budowanie zajmuje około dwóch godzin. Linku ze strony EAS **nie rozdawaj** — wygasa po trzydziestu
dniach i w połowie miesiąca przestaje działać komuś, kto właśnie zmienił telefon. Zamiast tego plik
idzie do wydania na GitHubie:

```bash
npm run release:friends
```

Znajomym podaje się jeden adres, ten sam na zawsze:
<https://github.com/MichalKlinWedge/FormaSync/releases/latest>. Zawsze prowadzi do najnowszego
pliku, więc wystarczy raz go wysłać, a przy kolejnej wersji nie trzeba pisać nic nowego.

**Nie instaluj tego APK na własnym telefonie.** Ma ten sam identyfikator pakietu i ten sam klucz
podpisu co Twój, więc nadpisałby Twoją instalację i przeniósł telefon na kanał `friends` —
od tej chwili `npm run ota` przestałby do niego docierać. Do siebie budujesz profil `preview`.

Nowy plik jest potrzebny tylko wtedy, gdy zmieni się wersja aplikacji w `app.json` albo dojdzie
moduł natywny — czyli gdy zmieni się runtime. Poza tym poprawki idą same:

```bash
npm run ota:friends -- --message "Co się zmieniło"
```

Aplikacja pyta serwer przy starcie i po każdym powrocie na pierwszy plan, a gdy coś znajdzie,
pokazuje znaczek na ekranie startowym — dotknięcie uruchamia nową wersję. Bez dotykania niczego
paczka wchodzi przy **drugim** uruchomieniu aplikacji. Dlatego przed pierwszym rozdaniem lepiej
zbudować APK na świeżo, niż rozdać stary i dosłać poprawkę — pierwsze wrażenie z aplikacji byłoby
z błędem, który już jest naprawiony.

## Wiadomość do przekazania

```
FormaSync — aplikacja treningowa (Android)

1. Pobierz APK z linku i zainstaluj. Android zapyta o zgodę na
   "instalowanie z nieznanych źródeł" — trzeba ją włączyć.
2. Wszystkie dane zostają w telefonie. Nic nie wychodzi na zewnątrz,
   dopóki sam tego nie włączysz.

Co możesz ustawić u siebie (wszystko opcjonalne):
• Garmin — logujesz się na własne konto, żeby wciągać tętno, sen
  i treningi z zegarka oraz wysyłać plany na zegarek.
• Trener AI — potrzebuje własnego klucza do jednego z trzech:
  Gemini, Claude albo ChatGPT. Klucz zakłada się u dostawcy
  i rozlicza na własnym koncie.
• Kopie zapasowe na serwerze — podaję adres i token zaproszenia
  osobno. Kopia jest szyfrowana hasłem, które znasz tylko Ty:
  zapisz je poza telefonem, bo bez niego kopii nie odzyska nikt,
  łącznie ze mną.
```

## Token zaproszenia

Adres skrytki i token zaproszenia przekazuj **osobno i nie mailem**. Do tej samej wiadomości,
w której jest adres, nie powinien wpaść klucz do niego, a poczta zostaje w skrzynce na lata.

Reszta — jak rejestracja działa, co odzyskuje adres e-mail (token, nigdy hasło) i jak dopisać
kogoś ręcznie — jest w [../server/README.md](../server/README.md).
