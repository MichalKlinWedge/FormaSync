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
