# FormaSync

System wspomagania treningu siłowego z integracją Garmin.

- `mobile/` — aplikacja Android (React Native + Expo), szczegóły w [mobile/README.md](mobile/README.md)
- `tools/garmin/` — wysyłka planów do Garmin Connect z komputera, szczegóły w [tools/garmin/README.md](tools/garmin/README.md)
- `PLAN_ETAPOWY.md` — plan realizacji projektu
- Specyfikacja: `Specyfikacja Projektowa Aplikacji Treningowej z Integracją Garmin.pdf`, `techniczna.docx`

## Status

- [x] Etap 1 — fundament techniczny (projekt Expo, baza SQLite + migracje, seed, zakładki, EAS)
- [x] Etap 2 — katalog ćwiczeń (wyszukiwarka, filtry, szczegóły, własne ćwiczenia ze zdjęciem)
- [x] Etap 3 — kreator planów i szablony (tworzenie, edycja, kolejność, kopiowanie szablonów)
- [x] Etap 4 — trening na żywo (rejestracja serii, stoper, timer przerwy, wznawianie sesji)
- [x] Etap 5 — historia i korekta (dziennik, edycja serii po fakcie, aktualizacja planu)
- [x] Etap 6 — harmonogram i powiadomienia (kalendarz, cykle, przypomnienia push)
- [—] Etap 7 — backend serverless + e-mail (pominięty: bez webhooków Garmin zbędny, przypomnienia push wystarczają)
- [x] Etap 8 — biometria przez Android Health Connect (tętno, sen, HRV, ciśnienie, kalorie) oraz wczytywanie do historii treningów nagranych na zegarku
- [x] Etap 9 — plany na zegarek: wysyłka do biblioteki i kalendarza przez narzędzie na komputerze; eksport .FIT z aplikacji do skopiowania wprost na zegarek (Garmin Connect nie importuje plików treningowych)
- [x] Etap 10 — analityka (tonaż, progresja, 1RM, rekordy, pomiary ciała)
- [x] Etap 11 — RPE i auto-progresja (ocena serii, kalkulator 1RM, sugestie ciężaru)
- [ ] Etap 12 — stabilizacja i wydanie (kopia zapasowa i polityka prywatności gotowe; zostają testy na urządzeniu i wydanie)
