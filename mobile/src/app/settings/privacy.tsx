import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * Health Connect wymaga, by aplikacja czytająca dane zdrowotne pokazywała politykę
 * prywatności — ten ekran otwiera się także z systemowego okna zgód.
 */
export default function PrivacyScreen() {
  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Gdzie trafiają Twoje dane">
          <Paragraph>
            Nigdzie. Wszystko, co zapiszesz w FormaSync — plany, historia treningów, pomiary ciała, własne
            ćwiczenia i odczytane dane zdrowotne — pozostaje w pamięci tego telefonu. Aplikacja nie ma konta,
            nie wysyła danych na żaden serwer i nie udostępnia ich nikomu.
          </Paragraph>
        </Section>

        <Section title="Dane zdrowotne z Health Connect">
          <Paragraph>
            Za Twoją zgodą aplikacja odczytuje z Health Connect: tętno, tętno spoczynkowe, zmienność rytmu
            serca, czas snu, ciśnienie krwi i spalone kalorie. Źródłem tych danych jest aplikacja, która je
            tam zapisuje — zwykle Garmin Connect.
          </Paragraph>
          <Paragraph>
            Odczytane wartości służą wyłącznie do pokazania ich przy Twoich treningach. Zapisujemy je w
            lokalnej bazie telefonu. Aplikacja nigdy nie zapisuje niczego do Health Connect.
          </Paragraph>
          <Paragraph>
            Zgodę możesz wycofać w każdej chwili w ustawieniach Health Connect. Dane odczytane wcześniej
            usuniesz, kasując dane aplikacji w ustawieniach Androida.
          </Paragraph>
        </Section>

        <Section title="Uprawnienia, o które prosimy">
          <Bullet>Powiadomienia — sygnał końca przerwy i przypomnienia o zaplanowanym treningu.</Bullet>
          <Bullet>Zdjęcia — tylko gdy sam dodasz grafikę do własnego ćwiczenia.</Bullet>
          <Bullet>Dostęp do plików — tylko w chwili zapisu kopii zapasowej lub pliku treningu.</Bullet>
        </Section>

        <Section title="Kopie zapasowe">
          <Paragraph>
            Kopia zapasowa to plik, który sam zapisujesz we wskazanym przez siebie miejscu. Od tej chwili
            odpowiadasz za niego Ty — jeśli trafi na dysk w chmurze, obowiązują zasady tej usługi.
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
