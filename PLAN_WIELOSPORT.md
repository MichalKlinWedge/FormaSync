# Plan: wiele sportów w FormaSync

Cel: obok treningu siłowego aplikacja ma prowadzić bieganie, rower i pływanie. Sporty przełącza się
w aplikacji, a kalendarz pokazuje wszystkie albo tylko wybrany.

Decyzje podjęte przed startem (4 października 2026):

- **Własny model odcinków** dla sportów wytrzymałościowych, a nie naciąganie serii i powtórzeń.
  Trening biegowy to rozgrzewka, interwały i schłodzenie — każdy odcinek z dystansem albo czasem
  i celem tempa lub tętna. Tak samo wygląda trening biegowy w Garminie, więc wysyłka na zegarek
  nie wymaga tłumaczenia jednego modelu na drugi.
- **Cztery sporty na stałe**: siła, bieganie, rower, pływanie. Trzy ostatnie dzielą ten sam model.
- **Wysyłka na zegarek od razu**, w tym samym etapie co model treningu.

## Model danych

Sport jest cechą planu i sesji, nie ćwiczenia. Istniejące dane dostają `STRENGTH`, więc nic nie
znika i nie trzeba niczego przepisywać.

| Tabela | Zmiana |
|---|---|
| `workout_plans` | nowa kolumna `sport` |
| `workout_sessions` | nowa kolumna `sport` (migawka z chwili startu, jak `title`) |
| `plan_segments` | **nowa** — odcinki planu wytrzymałościowego |
| `session_segments` | **nowa** — migawka odcinków z chwili startu sesji |
| `logged_segments` | **nowa** — co faktycznie przebiegnięte: dystans, czas, tempo, tętno |

Odcinek planu (`plan_segments`):

- `parentId` — odcinek należący do grupy powtórzeń wskazuje na nią; `kind = 'REPEAT'`
  z `repeatCount` tworzy grupę. Dwa poziomy wystarczą, tak samo jak w Garminie i w pliku FIT.
- `kind`: `WARMUP`, `WORK`, `RECOVERY`, `COOLDOWN`, `REPEAT`
- `durationType`: `DISTANCE`, `TIME`, `OPEN` + `distanceMeters` / `durationSeconds`
- `targetType`: `NONE`, `PACE`, `HEART_RATE` + `targetLow`, `targetHigh`
  (tempo w sekundach na kilometr, tętno w uderzeniach na minutę)

Statystyki siłowe (tonaż, 1RM, rekordy) zostają przy sile. Wytrzymałość dostaje własne: dystans,
tempo, czas w strefach tętna.

## Etapy

| # | Etap | Zakres |
|---|------|--------|
| 1 | **Sport jako wymiar aplikacji** | Kolumny `sport`, wybrany sport w ustawieniach, przełącznik w nagłówku, filtrowanie planów i historii. Istniejące dane to siła. |
| 2 | **Plany wytrzymałościowe** | Tabele odcinków, kreator planu: odcinki, grupy powtórzeń, dystans albo czas, cel tempa lub tętna. |
| 3 | **Trening wytrzymałościowy** | Prowadzenie treningu po odcinkach, zapis wykonania, przejście do następnego odcinka. |
| 4 | **Historia i statystyki** | Podsumowanie treningu wytrzymałościowego, tygodniowy dystans, tempo w czasie. Statystyki siłowe pozostają przy sile. |
| 5 | **Kalendarz wielosportowy** | Przełącznik „wszystkie / wybrany sport”, kolor kropki według sportu. |
| 6 | **Garmin** | Wysyłka treningów biegowych, rowerowych i pływackich narzędziem na komputerze; weryfikacja odczytem z konta. |
| 7 | **Import z zegarka** | Aktywność z Health Connect dostaje sport z typu ćwiczenia, a nie zawsze siłę. |

## Czego ten plan nie obejmuje

- Trasy i mapy. Health Connect udostępnia `ExerciseRoute`, ale rysowanie mapy to osobny temat.
- Strefy tętna liczone z tętna spoczynkowego i maksymalnego — na razie cel podaje się wprost.
- Pływanie w basenie z długościami i stylem. Pierwsze podejście traktuje je jak dystans i czas.
