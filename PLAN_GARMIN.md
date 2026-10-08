# Synchronizacja z Garmin Connect w aplikacji

Cel: wysłanie planu treningowego z FormaSync wprost do biblioteki Garmin Connect i do
kalendarza Garmina, bez komputera i bez pliku pośredniego.

## Decyzja i jej cena

Garmin nie udostępnia publicznego API do zapisu treningów — Training API jest płatne,
dla podmiotów prawnych i wstrzymane dla osób prywatnych. Jedyna droga to ten sam
nieoficjalny przepływ, z którego korzysta aplikacja mobilna Garmina. Wynikają z tego
trzy rzeczy, których nie da się obejść:

1. **Logowanie wymaga adresu e-mail i hasła do konta Garmina.** Zbieramy je raz, wymieniamy
   na tokeny i natychmiast zapominamy — hasło nie jest nigdzie zapisywane.
2. **Garmin może zmienić ten przepływ bez zapowiedzi.** Raz już to zrobił; biblioteka,
   na której wzorujemy implementację, została przez to oznaczona jako niewspierana.
   Synchronizacja potrafi więc przestać działać z dnia na dzień, a aplikacja musi to
   przeżyć bez utraty danych i powiedzieć wprost, co się stało.
3. **Eksport `.FIT` usunięty.** Miał być drogą awaryjną na wypadek padu API, ale wymagał
   kabla i wrzucał plik tylko na zegarek — do biblioteki ani kalendarza Garmina nic z niego
   nie trafiało. Gdy wysyłka do Connect zaczęła działać, przestał być tego wart. Drogą
   zapasową jest narzędzie na komputerze, czytające kopię zapasową.

## Co trzymamy na telefonie

| Co | Gdzie | Po co |
|---|---|---|
| token OAuth1 (`oauth_token`, `oauth_token_secret`, `mfa_token`) | `expo-secure-store` | długoterminowy; z niego odnawiamy dostęp bez pytania o hasło |
| token OAuth2 (bearer + czas wygaśnięcia) | `expo-secure-store` | krótkoterminowy, do zapytań; po wygaśnięciu wymieniany z OAuth1 |
| hasło | **nigdzie** | używane raz, w pamięci, przy logowaniu |

Rozłączenie konta kasuje oba tokeny.

## Przepływ logowania

1. `GET sso.garmin.com/sso/mobile/sso/en/sign-in?clientId=GCM_ANDROID_DARK` — ustawia ciasteczka.
2. `POST sso.garmin.com/sso/mobile/api/login` z `{username, password, rememberMe:false, captchaToken:""}`
   → `responseStatus.type = SUCCESSFUL` i `serviceTicketId`, albo `MFA_REQUIRED`.
3. Przy MFA: `POST /sso/mobile/api/mfa/verifyCode` z kodem → `serviceTicketId`.
4. `GET connectapi.garmin.com/oauth-service/oauth/preauthorized?ticket=…` podpisane OAuth1
   kluczem konsumenta pobranym z S3 → `oauth_token`, `oauth_token_secret`.
5. `POST connectapi.garmin.com/oauth-service/oauth/exchange/user/2.0` podpisane OAuth1
   → token OAuth2 (bearer).

Potem każde zapytanie do `connectapi.garmin.com` idzie z nagłówkiem `Authorization: Bearer …`,
a wygasły bearer odnawiamy krokiem 5.

## Etapy

1. **Podpis OAuth1 i klient HTTP** — HMAC-SHA1, nagłówek `Authorization: OAuth …`, testy na
   wektorach z RFC 5849. Bez sieci, czysta funkcja.
2. **Logowanie i tokeny** — przepływ SSO, obsługa dwuskładnikowego, zapis w SecureStore,
   odnawianie bearera, rozłączenie konta.
3. **Ekran konta** w Ustawieniach — stan połączenia, logowanie, kod MFA, rozłączenie.
4. **Treść treningu** — port `build_workout` i `build_endurance_workout` z narzędzia
   pythonowego na TypeScript, z testami na kształt JSON-a (siła, bieg, rower, pływanie,
   grupy powtórzeń, cele tempa i tętna).
5. **Wysyłka planu** — przycisk na ekranie planu (siłowym i wytrzymałościowym), nadpisywanie
   treningu o tej samej nazwie zamiast mnożenia kopii, zapis `garminWorkoutId` przy planie.
6. **Kalendarz** — wpisanie terminu do kalendarza Garmina i zdjęcie go przy usunięciu terminu;
   kolumny `garmin_synced`, `garmin_workout_id`, `garmin_schedule_id` już są w schemacie.

## Czego tu nie ma

- Pobierania treningów z Garmina do aplikacji — ruch jest jednokierunkowy.
- Logowania przez Google i Apple — Garmin prowadzi je inną drogą niż e-mail z hasłem.
- Captchy. Jeśli Garmin jej zażąda, logowanie się nie powiedzie i powiemy o tym wprost;
  obejście captchy byłoby obchodzeniem zabezpieczenia, a nie funkcją.
