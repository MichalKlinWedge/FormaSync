# Wysyłka planów FormaSync do Garmin Connect

Narzędzie uruchamiane na komputerze. Czyta kopię zapasową wyeksportowaną z aplikacji i tworzy z niej treningi siłowe w Garmin Connect, opcjonalnie wpisując je do kalendarza.

## Dlaczego na komputerze, a nie w aplikacji

Garmin Training API wymaga programu deweloperskiego, który jest wstrzymany, przeznaczony dla podmiotów prawnych i płatny. Zostaje nieoficjalny klient `garminconnect`, logujący się na konto użytkownika — biblioteka pythonowa, której nie da się uruchomić w aplikacji React Native. Wbudowanie jej oznaczałoby też trzymanie danych logowania do Garmina w telefonie.

Aplikacja ma osobną, niezależną drogę: **eksport planu do pliku `.FIT`**, który kopiuje się kablem wprost na zegarek (folder `NewFiles`). Garmin Connect nie przyjmuje plików treningowych przez import — obsługa Garmina potwierdza, że import działa wyłącznie dla plików aktywności. To narzędzie jest więc jedyną drogą, by trening trafił do biblioteki i kalendarza Garmin Connect — za cenę zależności od nieoficjalnego API.

**Garmin może zmienić to API bez zapowiedzi.** Tak właśnie stało się z przepływem logowania, przez co biblioteka `garth` (fundament `garminconnect`) została oznaczona jako niewspierana.

## Przygotowanie

```bash
pip install -r requirements.txt
```

Narzędzie korzysta z zapisanych tokenów Garmina — nie pyta o hasło. Szuka ich kolejno w:

1. ścieżce podanej przez `--tokenstore`,
2. zmiennej `GARMIN_TOKEN_STORE`,
3. zmiennej `GARMINTOKENS`,
4. `~/.garminconnect`.

Jeśli masz już tokeny z innego projektu, wskaż ich katalog, na przykład `--tokenstore D:\AI\Running\.garmin_tokens`. Jeśli ich nie masz, zaloguj się raz dowolnym skryptem korzystającym z `garminconnect` — zapisze je sam.

## Użycie

Wyeksportuj dane z aplikacji: **Ustawienia → Zapisz kopię do pliku**, przenieś plik na komputer.

```bash
# Podgląd — nic nie wysyła
python formasync_garmin.py upload --backup formasync-2026-10-02.json

# Wysyłka do biblioteki Garmin Connect
python formasync_garmin.py upload --backup formasync-2026-10-02.json --send

# Wysyłka razem z terminami z kalendarza aplikacji
python formasync_garmin.py upload --backup formasync-2026-10-02.json --send --schedule

# Tylko wybrany plan, od razu wypchnięty na zegarek
python formasync_garmin.py upload --backup kopia.json --plan "Mój plan" --send --push
```

Bez `--send` narzędzie wypisuje tylko, co by zrobiło. Szablony wbudowane są pomijane — wysyłane są wyłącznie Twoje własne plany.

### Podgląd konta

```bash
python formasync_garmin.py inspect                 # lista treningów
python formasync_garmin.py inspect --id 1676757230 # pełna struktura jednego
```

Przydatne, gdy coś na zegarku wygląda inaczej, niż powinno.

## Jak nagrać trening, żeby wróciły serie

Na zegarku uruchom trening z listy **Treningi** albo z kalendarza — nie zwykłą aktywność. Serie,
powtórzenia i ciężar zegarek liczy wyłącznie w aktywności siłowej prowadzonej po krokach
wczytanego treningu. Aktywność uruchomiona ręcznie (np. „Cardio”) zapisze sam czas i tętno:
`get_activity_exercise_sets` zwróci wtedy `null`.

## Sprawdzenie bez konta Garmin

W katalogu leży `example-backup.json` z przykładowymi danymi. Podgląd na nim nie wymaga logowania ani sieci:

```bash
python formasync_garmin.py upload --backup example-backup.json
```

## Jak budowany jest trening

Struktury nie składamy ręcznie — buduje ją `garminconnect.workout`, która zna wymagane identyfikatory. Każde ćwiczenie staje się grupą powtórzeń (`RepeatGroup`) z krokiem roboczym i przerwą w środku:

| Pole w aplikacji | Odpowiednik w Garmin Connect |
|---|---|
| `exercises.garmin_category` | `category`, np. `BENCH_PRESS` |
| `target_sets` | liczba iteracji grupy |
| `target_reps` | warunek końca `reps` |
| `target_duration_seconds` | warunek końca `time` (ćwiczenia na czas) |
| `target_weight` | `weightValue` w gramach, jednostka kilogram |
| `rest_duration_seconds` | osobny krok `rest` z warunkiem czasu |

Ćwiczenia bez przypisanej kategorii trafiają na zegarek jako nieokreślone — narzędzie wypisuje je ostrzeżeniem przed wysyłką.

Po wysłaniu każdy trening jest odczytywany z powrotem, a narzędzie wypisuje, co Garmin faktycznie zapisał: liczbę grup, liczbę kroków w środku oraz dla każdej grupy liczbę powtórzeń, kategorię i ciężar. Odpowiedź serwera potwierdza przyjęcie danych, a nie to, że zapisał je zgodnie z oczekiwaniem.

Sprawdzone na prawdziwym koncie 2 października 2026: trening siłowy utworzony poprawnie, struktura odczytana z powrotem bez zniekształceń.
