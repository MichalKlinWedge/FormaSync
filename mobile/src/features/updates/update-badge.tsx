import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable } from 'react-native';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

import { BADGE_LABELS, shouldCheck, updateBadge } from './badge';
import { describeCheck, fetchNewerBundle } from './check';

/**
 * Ikona nowej wersji na ekranie startowym. Gdy nie ma czego instalować, nie ma też ikony.
 *
 * `expo-updates` zagląda na serwer przy starcie aplikacji i — jeśli zdąży — pobiera paczkę w tle,
 * ale uruchamia ją dopiero przy następnym otwarciu. Bez takiego znaku nowa wersja wchodzi
 * niezauważona: kiedyś, przy którymś kolejnym starcie. Tu widać ją od razu i da się ją uruchomić
 * jednym dotknięciem.
 */
export function UpdateBadge() {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const {
    isUpdateAvailable,
    isUpdatePending,
    isDownloading,
    isRestarting,
    lastCheckForUpdateTimeSinceRestart,
  } = Updates.useUpdates();

  // Po powrocie na pierwszy plan pytamy serwer jeszcze raz — aplikacja potrafi stać w tle
  // tygodniami, a wtedy jedyne sprawdzenie, to przy starcie, dawno się przedawniło.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !Updates.isEnabled) return;
      if (!shouldCheck(lastCheckForUpdateTimeSinceRestart, Date.now())) return;
      void Updates.checkForUpdateAsync().catch(() => {
        // Nieudane pytanie o aktualizację nie jest wiadomością dla użytkownika — bez połączenia
        // ikona po prostu się nie pojawi, a ręczne sprawdzenie zostaje w ustawieniach.
      });
    });
    return () => subscription.remove();
  }, [lastCheckForUpdateTimeSinceRestart]);

  const badge = updateBadge({
    isEnabled: Updates.isEnabled,
    isUpdateAvailable,
    isUpdatePending,
    isDownloading: isDownloading || busy,
    isRestarting,
  });

  if (badge === 'HIDDEN') return null;

  // Restart gubi tylko to, co na ekranie — dane siedzą w bazie, a trening wznawia się sam.
  const offerRestart = (title: string, message: string) =>
    Alert.alert(title, message, [
      { text: 'Później', style: 'cancel' },
      { text: 'Uruchom teraz', onPress: () => void Updates.reloadAsync() },
    ]);

  const download = async () => {
    setBusy(true);
    const check = await fetchNewerBundle(Updates);
    setBusy(false);

    const { title, message } = describeCheck(check);
    if (check.state === 'ready') offerRestart(title, message);
    else Alert.alert(title, message);
  };

  const press = () => {
    if (badge === 'WORKING') return;
    if (badge === 'READY') {
      offerRestart('Nowa wersja gotowa', 'Zacznie działać po ponownym uruchomieniu aplikacji.');
      return;
    }
    void download();
  };

  if (badge === 'WORKING') {
    return <ActivityIndicator accessibilityLabel={BADGE_LABELS.WORKING} color={theme.chart1} />;
  }

  return (
    <Pressable accessibilityLabel={BADGE_LABELS[badge]} onPress={press} hitSlop={8}>
      <Icon
        name={badge === 'READY' ? 'rocket_launch' : 'arrow_circle_down'}
        size={26}
        color={badge === 'READY' ? theme.success : theme.chart1}
      />
    </Pressable>
  );
}
