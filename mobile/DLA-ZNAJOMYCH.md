# FormaSync dla znajomych

Co rozdać, komu i czym to potem aktualizować. Techniczna strona kanałów jest w
[README.md](README.md) — tutaj jest to, co trafia do człowieka.

## Skąd wziąć plik

```bash
npx eas-cli@latest build -p android --profile friends
```

Gotowy build daje na stronie EAS przycisk pobrania i kod QR — i to jest to, co się rozdaje.
Budowanie zajmuje około dwóch godzin.

**Nie instaluj tego APK na własnym telefonie.** Ma ten sam identyfikator pakietu i ten sam klucz
podpisu co Twój, więc nadpisałby Twoją instalację i przeniósł telefon na kanał `friends` —
od tej chwili `npm run ota` przestałby do niego docierać. Do siebie budujesz profil `preview`.

Późniejsze poprawki w samym JavaScripcie nie wymagają nowego pliku:

```bash
npm run ota:friends -- --message "Co się zmieniło"
```

Paczka dochodzi przy **drugim** uruchomieniu aplikacji. Dlatego przed pierwszym rozdaniem lepiej
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
• Trener AI — potrzebuje własnego klucza z Google AI Studio
  (darmowy pułap wystarcza).
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
