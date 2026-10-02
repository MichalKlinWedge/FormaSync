# Wysyłka planów FormaSync do Garmin Connect

Narzędzie uruchamiane na komputerze. Czyta kopię zapasową wyeksportowaną z aplikacji i tworzy z niej treningi siłowe w Garmin Connect, opcjonalnie wpisując je do kalendarza.

## Dlaczego na komputerze, a nie w aplikacji

Garmin Training API wymaga programu deweloperskiego, który jest wstrzymany, przeznaczony dla podmiotów prawnych i płatny. Zostaje nieoficjalny klient `garminconnect`, logujący się na konto użytkownika — biblioteka pythonowa, której nie da się uruchomić w aplikacji React Native. Wbudowanie jej oznaczałoby też trzymanie danych logowania do Garmina w telefonie.

Aplikacja ma osobną, niezależną drogę: **eksport planu do pliku `.FIT`**, który importuje się ręcznie w Garmin Connect. To narzędzie robi więcej — wpisuje treningi także do kalendarza — ale jest zależne od nieoficjalnego API.

**Garmin może zmienić to API bez zapowiedzi.** Tak właśnie stało się z przepływem logowania, przez co biblioteka `garth` (fundament `garminconnect`) została oznaczona jako niewspierana.

## Przygotowanie

```bash
pip install -r requirements.txt
```

Narzędzie korzysta z zapisanych tokenów Garmina — nie pyta o hasło. Domyślnie szuka ich w `~/.garminconnect`; inną ścieżkę wskazuje `--tokenstore`, działa też zmienna środowiskowa `GARMINTOKENS`. Jeśli tokenów nie masz, zaloguj się raz dowolnym skryptem korzystającym z `garminconnect`.

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

Po wysłaniu każdy trening jest odczytywany z powrotem i sprawdzana jest liczba kroków. Odpowiedź serwera potwierdza przyjęcie danych, a nie to, że zapisał je zgodnie z oczekiwaniem.
