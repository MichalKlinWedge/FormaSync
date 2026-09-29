# Plan etapowy realizacji — FormaSync

Na podstawie: *Specyfikacja Projektowa Aplikacji Treningowej z Integracją Garmin.pdf* (v1.0) oraz *techniczna.docx* (SPEC_PROJEKTU.md).

Założenia: jeden zespół (1–2 deweloperów), Android, React Native + Expo, praca w iteracjach. Szacunki czasu są orientacyjne dla jednego dewelopera.

---

## 0. Ryzyka i luki w specyfikacji, które trzeba rozstrzygnąć przed startem

| # | Problem | Wpływ | Rekomendacja |
|---|---------|-------|--------------|
| R1 | **Dostęp do Garmin Health API / Training API** wymaga zgłoszenia do Garmin Connect Developer Program i akceptacji przez Garmin (program kierowany do firm, weryfikacja trwa tygodnie). | Blokuje cały moduł Garmin (MUST HAVE). | Złożyć wniosek **w tygodniu 1**, równolegle z pracą nad aplikacją. Przygotować plan B (patrz R3). |
| R2 | Spec zakłada „brak własnego backendu”, ale Garmin Health API działa w modelu **push/ping na publiczny adres callback (webhook)**, a klucz/secret aplikacji nie może być zaszyty w APK. To samo dotyczy klucza Resend API. | Architektura bez backendu jest niewykonalna dla Garmin i niebezpieczna dla e-mail. | Dodać **minimalny backend serverless** (np. Cloudflare Workers / Supabase Edge Functions / Firebase Functions): wymiana tokenów OAuth, odbiór webhooków Garmin, kolejka danych do pobrania przez aplikację, proxy do e-mail. |
| R3 | Brak gwarancji akceptacji Garmin. | Ryzyko niedowiezienia MUST HAVE. | Plan B: odczyt danych przez **Android Health Connect** (Garmin Connect może tam zapisywać część danych — zakres do zweryfikowania), eksport treningu do pliku `.FIT` do ręcznego importu. |
| R4 | **Expo Go** nie obsłuży natywnych modułów/redirectów OAuth tak jak produkcyjna aplikacja. | Testy „na żywo” wg pkt 4.1 specyfikacji wystarczą tylko na początku. | Od etapu 1 używać **development build** (`expo-dev-client`) + EAS. Użyć aktualnego stabilnego Expo SDK (SDK 51 z dokumentu jest już przestarzałe). |
| R5 | Timery JS **nie działają w tle** na Androidzie. | Timer przerwy „z sygnałem” może nie zadzwonić przy wygaszonym ekranie. | Liczyć czas na podstawie znaczników czasu, a sygnał końca przerwy planować jako lokalne powiadomienie (`expo-notifications`) + opcjonalnie keep-awake w trybie treningu. |
| R6 | Luki w schemacie bazy (szczegóły w etapie 1). | Brak miejsca na część wymagań. | Rozszerzyć DDL przed implementacją, wprowadzić migracje. |

**Decyzje do podjęcia na starcie:** Zustand vs Redux Toolkit (rekomendacja: **Zustand** — prostszy, wystarczający), goły `expo-sqlite` vs ORM (rekomendacja: **expo-sqlite + Drizzle ORM** — typowane zapytania i migracje), dostawca e-mail (Resend przez backend vs EmailJS z klienta), wybór platformy serverless.

---

## Etap 0 — Przygotowanie (≈ 1 tydzień)

- Złożenie wniosku do Garmin Connect Developer Program (Health API + Training API) — **zadanie krytyczne, długi czas oczekiwania**.
- Rozstrzygnięcie decyzji z sekcji 0; aktualizacja specyfikacji (backend serverless, poprawki DDL).
- Makiety kluczowych ekranów (low-fi): katalog, kreator planu, trening na żywo, kalendarz, historia.
- Przygotowanie danych słownikowych: lista kategorii (partie mięśniowe), sprzętu, ~50–100 ćwiczeń z opisami i grafikami (ustalić źródło i licencję grafik).
- Treść szablonów: FBW, Push-Pull-Legs, Trening Domowy.

**Rezultat:** zatwierdzona spec v1.1, makiety, dane seed, złożony wniosek Garmin.

---

## Etap 1 — Fundament techniczny (≈ 1–1,5 tygodnia)

- Inicjalizacja projektu Expo (TypeScript, `expo-router`), ESLint/Prettier, struktura katalogów (feature-based).
- Development build + konfiguracja EAS (`eas.json` z profilami `development` i `preview` → APK).
- Warstwa danych: `expo-sqlite` + migracje, repozytoria/serwisy, store Zustand.
- **Rozszerzenie schematu** względem spec:
  - `exercise_muscles` (N:M ćwiczenie ↔ partie mięśniowe — filtrowanie po kilku partiach),
  - `body_measurements` (data, waga, obwody) — wymagane przez moduł analityki,
  - `logged_sets.rpe` (RPE per seria — wymóg COULD mówi o ocenie po serii),
  - `scheduled_workouts.scheduled_time`, `reminder_offset_min`, `garmin_workout_id`, `garmin_schedule_id`,
  - `workout_sessions.plan_id` (sesje bez harmonogramu / ad hoc),
  - podział biometrii: `garmin_activity_metrics` (per sesja) i `garmin_daily_health` (per dzień: RHR, HRV, sen, stres, ciśnienie) — dane dobowe nie są 1:1 z sesją,
  - `app_settings` (e-mail, preferencje powiadomień, jednostki).
- Tokeny Garmin/sekrety wyłącznie w `expo-secure-store`, nie w SQLite.
- Seed słowników i szablonów przy pierwszym uruchomieniu.
- Testy jednostkowe warstwy danych (Jest).

**Rezultat:** aplikacja startuje na telefonie z dev buildu, baza z danymi seed, pierwszy APK z EAS.

---

## Etap 2 — Katalog ćwiczeń *(MUST)* (≈ 1 tydzień)

- Lista ćwiczeń z wyszukiwarką i filtrami: partia mięśniowa, sprzęt, poziom trudności.
- Ekran szczegółów: instrukcja krok po kroku, opis techniki, grafika/zdjęcie (grafiki w paczce aplikacji — działanie offline).
- Dodawanie/edycja własnych ćwiczeń.

**Kryterium odbioru:** użytkownik znajduje ćwiczenie po 2 filtrach naraz, całość działa w trybie samolotowym.

---

## Etap 3 — Kreator planów i szablony *(MUST)* (≈ 1,5 tygodnia)

- Tworzenie/edycja planu: dobór ćwiczeń z katalogu, kolejność (drag & drop), serie, powtórzenia, ciężar (kg), czas trwania (ćwiczenia na czas), przerwa.
- Biblioteka szablonów (FBW, PPL, Dom) — podgląd i „kopiuj do moich planów” (szablon pozostaje nienaruszony).
- Walidacja (np. seria musi mieć powtórzenia **lub** czas).

**Kryterium odbioru:** z szablonu PPL można w < 1 min utworzyć własny, zmodyfikowany plan.

---

## Etap 4 — Tryb treningu na żywo *(MUST)* (≈ 2 tygodnie — najbardziej złożony UX)

- Start sesji z planu, z harmonogramu lub „pusty trening”.
- Rejestracja serii: podpowiedź wartości docelowych, szybka korekta powtórzeń/ciężaru, oznaczanie serii jako wykonanej.
- Ogólny stoper sesji + automatyczny timer przerwy po zatwierdzeniu serii, sygnał dźwiękowy/wibracja; powiadomienie przy wygaszonym ekranie (patrz R5).
- Odporność: zapis każdej serii od razu do bazy — wznowienie sesji po zamknięciu/zabiciu aplikacji.
- Zakończenie: podsumowanie (czas, tonaż, liczba serii), notatka, ogólne RPE sesji.

**Kryterium odbioru:** pełny trening 60 min na fizycznym telefonie z wygaszaniem ekranu — żadna seria nie ginie, sygnał przerwy zawsze dochodzi.

> **Kamień milowy M1 — MVP offline (koniec ~7. tygodnia):** katalog, plany, szablony, trening na żywo. APK do testów na własnym telefonie.

---

## Etap 5 — Historia i korekta *(MUST)* (≈ 1 tydzień)

- Dziennik ukończonych treningów (lista + szczegóły sesji).
- Edycja zalogowanych serii po fakcie, notatki potreningowe.
- Z notatki/historii: szybka akcja „zaktualizuj plan” (np. podnieś ciężar docelowy).

---

## Etap 6 — Harmonogram, kalendarz i powiadomienia push *(MUST)* (≈ 1,5 tygodnia)

- Widok kalendarza (miesiąc/tydzień): treningi zaplanowane, wykonane, pominięte.
- Przypisanie planu do dnia (jednorazowo i cyklicznie, np. pn/śr/pt).
- Lokalne przypomnienia (`expo-notifications`) z konfigurowalnym wyprzedzeniem; obsługa uprawnień Androida 13+ i dokładnych alarmów; odtwarzanie harmonogramu powiadomień po restarcie/aktualizacji.
- Powiązanie sesji z `scheduled_workouts` i oznaczanie `is_completed`.

> **Kamień milowy M2 — Kompletny dziennik (koniec ~10. tygodnia):** wszystkie MUST HAVE poza e-mailem i Garmin.

---

## Etap 7 — Backend serverless + e-mail *(MUST)* (≈ 1–1,5 tygodnia)

- Postawienie minimalnego backendu (patrz R2): autoryzacja urządzenia/użytkownika, konfiguracja sekretów, logowanie błędów.
- Endpoint proxy e-mail (Resend) z limitem wysyłek; szablony: przypomnienie o treningu, podsumowanie sesji, podsumowanie tygodnia.
- Ustawienia e-mail w aplikacji; kolejka wysyłki offline (wyślij, gdy wróci sieć).

**Kryterium odbioru:** klucz API dostawcy e-mail nie występuje w APK; podsumowanie sesji dochodzi na skrzynkę.

---

## Etap 8 — Garmin: autoryzacja i pobieranie biometrii *(MUST)* (≈ 2–3 tygodnie, zależne od akceptacji Garmin)

- OAuth 2.0 (PKCE) z Garmin: okno logowania w aplikacji (`expo-auth-session` / deep link), wymiana i odświeżanie tokenów po stronie backendu, rozłączanie konta.
- Backend: endpointy webhook (ping/push) dla Activity, Daily, Sleep, Stress, HRV, Blood Pressure; buforowanie danych do odbioru przez aplikację.
- Aplikacja: synchronizacja przy starcie / po zakończeniu sesji; dopasowanie aktywności Garmin do sesji po oknie czasowym `start_time`–`end_time` (z tolerancją); zapis do tabel biometrii + `raw_json`.
- Prezentacja na ekranie sesji i dnia: tętno śr./maks., kalorie, RHR, HRV, sen, stres, ciśnienie.
- Obsługa braków danych (brak zegarka na treningu, brak ciśnieniomierza Index BPM).

**Jeśli Garmin nie zaakceptował wniosku:** realizacja planu B (Health Connect), etap przesuwa się na koniec.

---

## Etap 9 — Garmin: wysyłanie planów do kalendarza *(MUST)* (≈ 1,5–2 tygodnie)

- Mapowanie `plan_exercises` → format workoutu Garmin Training API (sport: trening siłowy, kroki z seriami/powtórzeniami/przerwami, mapowanie ćwiczeń na kategorie ćwiczeń Garmin — tabela mapowań).
- Utworzenie workoutu i zaplanowanie go na dzień; zapis `garmin_workout_id`, flaga `garmin_synced`.
- Aktualizacja/usuwanie po zmianie planu lub terminu; ponawianie przy błędach sieci.

**Kryterium odbioru:** trening zaplanowany w aplikacji pojawia się na zegarku po synchronizacji Garmin Connect.

> **Kamień milowy M3 — Integracja Garmin (koniec ~16.–17. tygodnia):** wszystkie MUST HAVE zrealizowane.

---

## Etap 10 — Analityka i postępy *(SHOULD)* (≈ 1,5 tygodnia)

- Wykresy: tonaż (sesja/tydzień/partia mięśniowa), progresja ciężaru dla ćwiczenia, szacowany 1RM (np. wzór Epleya/Brzyckiego) w czasie.
- Rekordy osobiste.
- Historia wagi i wymiarów ciała (tabela `body_measurements`).
- Korelacje z Garmin (np. RHR/HRV/sen vs wydajność treningu) — widok podstawowy.

---

## Etap 11 — RPE i auto-progresja *(COULD)* (≈ 1 tydzień)

- Ocena RPE 1–10 po każdej serii w trybie na żywo (opcjonalna).
- Kalkulator 1RM jako osobne narzędzie.
- Sugestie ciężaru na kolejny tydzień (reguły: wykonane wszystkie powtórzenia przy RPE ≤ 8 → +2,5 kg / +5% itp.), akceptowane ręcznie przez użytkownika.

---

## Etap 12 — Stabilizacja i wydanie (≈ 1–1,5 tygodnia)

- Testy E2E kluczowych ścieżek (Maestro), testy na 2–3 urządzeniach i wersjach Androida.
- Wydajność (listy, wykresy), dostępność, tryb ciemny.
- Kopia zapasowa/eksport danych (eksport bazy/JSON — dane są tylko lokalne, utrata telefonu = utrata historii).
- Polityka prywatności (dane zdrowotne — wymagana przez Garmin i Google), obsługa zgód.
- Build `preview` (APK) wg pkt 4.2 specyfikacji; opcjonalnie profil `production` (AAB) pod Google Play.

> **Kamień milowy M4 — Wydanie 1.0 (≈ 20.–22. tydzień).**

---

## Harmonogram zbiorczy

| Etap | Zakres | Priorytet | Szac. czas | Zależności |
|------|--------|-----------|-----------|------------|
| 0 | Przygotowanie, wniosek Garmin | — | 1 tydz. | — |
| 1 | Fundament techniczny | — | 1–1,5 tydz. | 0 |
| 2 | Katalog ćwiczeń | MUST | 1 tydz. | 1 |
| 3 | Kreator planów, szablony | MUST | 1,5 tydz. | 2 |
| 4 | Trening na żywo | MUST | 2 tydz. | 3 |
| 5 | Historia i korekta | MUST | 1 tydz. | 4 |
| 6 | Harmonogram, push | MUST | 1,5 tydz. | 3 |
| 7 | Backend + e-mail | MUST | 1–1,5 tydz. | 1 |
| 8 | Garmin – biometria | MUST | 2–3 tydz. | 4, 7, akceptacja Garmin |
| 9 | Garmin – plany do kalendarza | MUST | 1,5–2 tydz. | 6, 8 |
| 10 | Analityka | SHOULD | 1,5 tydz. | 5 (+8 dla korelacji) |
| 11 | RPE, auto-progresja | COULD | 1 tydz. | 4, 10 |
| 12 | Stabilizacja, wydanie | — | 1–1,5 tydz. | wszystkie |

**Łącznie: ok. 17–22 tygodni** pracy jednego dewelopera. Przy dwóch osobach ścieżki można zrównoleglić: *aplikacja offline (2→6)* oraz *backend + Garmin (7→9)* — realnie ok. 11–13 tygodni.

Ścieżka krytyczna: **akceptacja Garmin → etap 8 → etap 9**. Dlatego wniosek składamy w etapie 0, a moduły offline są zaprojektowane tak, by nie zależały od Garmin.
