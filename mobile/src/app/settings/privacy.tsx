import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Aplikacja czytająca dane zdrowotne powinna pokazywać politykę
 * prywatności — ten ekran otwiera się także z systemowego okna zgód.
 */
export default function PrivacyScreen() {
  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Gdzie trafiają Twoje dane">
          <Paragraph>
            Domyślnie nigdzie. Wszystko, co zapiszesz w FormaSync — plany, historia treningów, pomiary
            ciała, własne ćwiczenia i odczytane dane zdrowotne — pozostaje w pamięci tego telefonu.
            Aplikacja nie ma konta i nie udostępnia danych nikomu.
          </Paragraph>
          <Paragraph>
            Dane opuszczają telefon wyłącznie wtedy, gdy sam o to poprosisz, i tylko tam, gdzie wskażesz:
          </Paragraph>
          <Bullet>
            Kopia na serwerze — jeśli ją ustawisz, raz na dobę leci na Twój serwer kopia całej bazy,
            zaszyfrowana Twoim hasłem. Serwer nie zna hasła i nie potrafi jej odczytać.
          </Bullet>
          <Bullet>
            Garmin Connect — jeśli połączysz konto, do Garmina trafiają wysyłane przez Ciebie plany
            treningowe i terminy w kalendarzu. Historia, pomiary ciała ani notatki nigdy tam nie idą.
            W drugą stronę czytamy Twoje aktywności i dane zdrowotne — stąd biorą się treningi z zegarka
            i biometria przy treningach.
          </Bullet>
          <Bullet>
            Model AI — do wyboru Gemini (Google), Claude (Anthropic) albo ChatGPT (OpenAI). Dane
            wychodzą tylko do tego, którego klucz wkleisz i którego wskażesz przy zapytaniu. Przy
            każdym układaniu planu pod zawody lecą: dyscyplina, nazwa i data zawodów, dystans, czas
            docelowy, dni treningowe, tygodniowa objętość, najlepsze tempo oraz lista treningów
            z ostatnich tygodni — data, dystans, czas i tempo każdego. Nie idą pomiary ciała, tętno,
            sen, ciśnienie ani nazwa konta Garmina. Zapytanie leci wprost z telefonu do dostawcy,
            bez serwera pośrodku.
          </Bullet>
          <Bullet>
            Model AI przy kaloriach — jeśli opiszesz posiłek słowami i dotkniesz „Oszacuj”, do
            wybranego dostawcy leci sam ten opis i prośba o wartości odżywcze. Nie idą z nim ani pozostałe posiłki, ani
            masa ciała, ani cel diety. Całe liczenie kalorii działa bez tego — opis słowami jest
            jedną z czterech dróg, obok bazy produktów, kodu kreskowego i wpisu z ręki.
          </Bullet>
          <Bullet>
            Model AI przy propozycji posiłków — jeśli poprosisz o ułożenie dnia, lecą liczby:
            ile kalorii i białka zostało do rozdysponowania, ile wychodzi Twój typowy obiad i czy masz
            dziś trening, a do tego Twoje wytyczne żywieniowe i opis obiadu, jeśli go wpiszesz. Nie
            idzie dziennik posiłków, masa ciała ani historia treningów. Gotowa propozycja zostaje
            w telefonie.
          </Bullet>
          <Bullet>
            Zdjęcie posiłku — jeśli dołączysz je do opisu, pojedzie do wybranego dostawcy razem z nim, jako
            jedno zdjęcie wybrane przez Ciebie i dopiero po dotknięciu „Oszacuj”. Przed wysłaniem
            kadrujesz je sam, więc w kadrze może zostać sam talerz. Zdjęcie nie jest nigdzie
            zapisywane: nie trafia do bazy produktów, do historii dnia ani do kopii zapasowej —
            znika razem z ekranem, a zostają same liczby.
          </Bullet>
          <Bullet>
            Open Food Facts — przy skanowaniu kodu kreskowego do tej otwartej bazy produktów leci sam
            kod z opakowania. Nic więcej: ani zdjęcie, ani nazwa urządzenia, ani cokolwiek o Tobie.
            Obraz z kamery nie opuszcza telefonu i nie jest nigdzie zapisywany — służy wyłącznie do
            odczytania cyfr. Pytamy dopiero wtedy, gdy kodu nie ma jeszcze w Twojej bazie.
          </Bullet>
        </Section>

        <Section title="Modele AI">
          <Paragraph>
            Wszystko, co robi model, jest wyłączone, dopóki sam nie wkleisz klucza i nie potwierdzisz
            zgody. Klucz zakładasz u dostawcy, którego wybierzesz, i on rozlicza zapytania na Twoim
            koncie — aplikacja nie ma własnego konta u żadnego z nich. Plan z reguł działa bez tego,
            bez internetu i bez niczyjego konta, i zostaje domyślny.
          </Paragraph>
          <Paragraph>
            Klucze są osobne dla każdego dostawcy i każdy usuwa się jednym przyciskiem: Ustawienia →
            Modele AI. Tam też wycofasz zgodę. Klucze leżą w bezpiecznym magazynie telefonu, nie
            w bazie, więc nie trafiają do kopii zapasowej i nie da się ich odczytać z powrotem —
            także z tego ekranu.
          </Paragraph>
          <Paragraph>
            Tego, co dostawca robi z przysłanym zapytaniem, ta aplikacja nie kontroluje. Zasady
            przetwarzania są po jego stronie i zależą od rodzaju Twojego klucza — na darmowych
            poziomach dostawcy zwykle zastrzegają sobie prawo wykorzystania zapytań do ulepszania
            modeli. Wysyłasz tylko do tego, którego klucz sam wkleiłeś.
          </Paragraph>
        </Section>

        <Section title="Dane zdrowotne z Garmin Connect">
          <Paragraph>
            Po połączeniu konta aplikacja odczytuje z Garmin Connect: tętno, tętno spoczynkowe, zmienność
            rytmu serca, czas snu, ciśnienie krwi i spalone kalorie, a także listę Twoich aktywności.
          </Paragraph>
          <Paragraph>
            Odczytane wartości służą wyłącznie do pokazania ich przy Twoich treningach. Zapisujemy je w
            lokalnej bazie telefonu i nie wysyłamy nikomu dalej.
          </Paragraph>
          <Paragraph>
            Połączenie rozwiążesz w każdej chwili w Ustawieniach, przyciskiem odłączenia konta Garmin.
            Dane odczytane wcześniej usuniesz, kasując dane aplikacji w ustawieniach Androida.
          </Paragraph>
        </Section>

        <Section title="Uprawnienia, o które prosimy">
          <Bullet>Powiadomienia — sygnał końca przerwy i przypomnienia o zaplanowanym treningu.</Bullet>
          <Bullet>Zdjęcia — tylko gdy sam dodasz grafikę do własnego ćwiczenia.</Bullet>
          <Bullet>Dostęp do plików — tylko w chwili zapisu kopii zapasowej lub pliku treningu.</Bullet>
        </Section>

        <Section title="Kopie zapasowe">
          <Paragraph>
            Kopia zapisana do pliku trafia we wskazane przez Ciebie miejsce i od tej chwili odpowiadasz
            za nią Ty — jeśli trafi na dysk w chmurze, obowiązują zasady tej usługi. Taki plik nie jest
            zaszyfrowany.
          </Paragraph>
          <Paragraph>
            Kopia wysyłana na Twój serwer jest zaszyfrowana hasłem znanym tylko Tobie i temu telefonowi.
            Hasła nie da się odzyskać — bez niego kopie są bezużyteczne także dla Ciebie.
          </Paragraph>
          <Paragraph>
            Jeśli rejestrujesz skrytkę adresem e-mail, ten adres zostaje na serwerze — jako etykieta
            Twojej półki i jedyny sposób odzyskania dostępu po zmianie telefonu. Serwer nie wysyła go
            nikomu dalej i nie używa do niczego innego niż ten jeden list z potwierdzeniem. Rejestracja
            jest dobrowolna: z gotowym tokenem od administratora skrytka działa bez podawania adresu.
          </Paragraph>
        </Section>

        <Section title="Usunięcie danych">
          <Paragraph>
            Odinstalowanie aplikacji usuwa wszystkie jej dane z telefonu. Pojedyncze treningi i pomiary
            możesz kasować w aplikacji.
          </Paragraph>
        </Section>
      </ScrollView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

const Paragraph = ({ children }: { children: React.ReactNode }) => (
  <ThemedText type="small">{children}</ThemedText>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <ThemedText type="small">{'•  '}{children}</ThemedText>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
});
