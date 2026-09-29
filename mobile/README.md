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
