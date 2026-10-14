# FormaSync — aplikacja mobilna

Aplikacja do planowania, prowadzenia i analizy treningów siłowych z integracją Garmin (Android, React Native + Expo SDK 57).

## Stos

- Expo Router (`src/app/`), natywne zakładki
- SQLite (`expo-sqlite`) + Drizzle ORM — schemat w `src/db/schema.ts`, migracje w `drizzle/`
- Zustand (stan aplikacji), `expo-secure-store` (tokeny)
- Jest (`jest-expo`) + `better-sqlite3` do testów warstwy danych

## Uruchomienie

```bash
npm install
npx expo start
```

Aplikacja używa natywnych modułów, więc do testów na telefonie potrzebny jest **development build** (Expo Go nie wystarczy przy OAuth Garmin):

```bash
npx eas-cli@latest build -p android --profile development
```

Samodzielny plik APK do instalacji:

```bash
npx eas-cli@latest build -p android --profile preview
```

### Dwa kanały: mój i dla znajomych

APK słucha **kanału wpisanego w profil, z którego powstał** — i tylko jego. Paczka wypchnięta na
inną gałąź nigdy do niego nie dotrze, choć EAS zgłosi sukces. Na tym stoi cały podział:

| Profil | Kanał | Dla kogo | Czym dostaje aktualizacje |
| --- | --- | --- | --- |
| `preview` | `preview` | ja | `npm run ota` |
| `friends` | `friends` | znajomi | `npm run ota:friends` |

APK dla znajomych buduje się raz i rozdaje linkiem:

```bash
npm run apk:friends
```

Link, który EAS daje do gotowego pliku, **wygasa po trzydziestu dniach** — wysłany na czacie
przestaje działać w połowie miesiąca. Dlatego plik ląduje w wydaniu na GitHubie, pod adresem,
który się nie zmienia:

```bash
npm run release:friends
```

Skrypt bierze ostatni gotowy build z profilu `friends`, pobiera z niego plik i wystawia wydanie
z listą zmian z historii repozytorium. Dla znajomych zostaje jeden link na zawsze:
[releases/latest](https://github.com/MichalKlinWedge/FormaSync/releases/latest). Co poszłoby do
wydania, widać bez skutków ubocznych: `node scripts/release-apk.mjs friends --dry-run`.

Dzięki temu `npm run ota` wysyła paczkę **wyłącznie na mój telefon**. Robota w toku, w której
jeszcze coś nie działa, nie ma jak trafić do kogoś, kto akurat jest w połowie treningu. Do
znajomych idzie tylko to, co sam tam wypchnę osobnym poleceniem — i wtedy świadomie.

Gałąź jest w obu skryptach wpisana na stałe, a nie podawana z palca: pomyłka w tym jednym słowie
to cicha wysyłka do złej grupy, o której EAS powie „sukces”. Lista kanałów i ich gałęzi:

```bash
npx eas-cli@latest channel:list
```

### Aktualizacje OTA

Zmiany wyłącznie w JavaScripcie (ekrany, logika, dane startowe) idą na telefon bez nowego APK:

```bash
npm run ota -- --message "Co się zmieniło"
```

Aplikacja sprawdza serwer przy starcie i instaluje paczkę przy następnym uruchomieniu, więc nowa
wersja pojawia się za drugim razem. **Ustawienia → Sprawdź aktualizację** robi to od razu, a linijka
nad przyciskiem mówi, która paczka właśnie działa.

Paczka dociera tylko do APK o **tej samej wersji aplikacji** — `runtimeVersion` ma politykę
`appVersion`. Podbicie `version` w `app.json` odcina więc od aktualizacji wszystkie wcześniejsze
instalacje, a przy dwóch grupach odbiorców boli to podwójnie: swój telefon zaktualizujesz od
razu, a znajomym trzeba rozdać nowy APK, bo do starego nic już nie dojdzie. Dlatego wersję podbija
się wtedy, gdy i tak idzie nowy plik — nie po drodze.

## Baza danych

Po zmianie `src/db/schema.ts` wygeneruj migrację:

```bash
npm run db:generate
```

Migracje są wbudowywane w bundle i uruchamiane przy starcie (`src/components/database-provider.tsx`), po nich wykonuje się seed słowników, ćwiczeń i szablonów (`src/db/seed.ts`). Zmiana danych w `src/db/seed-data.ts` wymaga podbicia `SEED_VERSION`.

## Kontrola jakości

```bash
npm run typecheck
npm run lint
npm test
```
