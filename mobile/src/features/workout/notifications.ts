import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';

import { countdownNotificationPlan, type CountdownNotification } from './countdown-cues';

// Sygnały odliczania muszą zadziałać także przy wygaszonym ekranie, gdy Android wstrzymuje
// liczniki JS (R5 w planie) — dzwonek i pikanie z ekranu trwającego treningu wtedy nie zabrzmią.
// Dlatego planujemy lokalne powiadomienia z wyprzedzeniem, a ich identyfikatory trzymamy
// w bazie — przeżywają zamknięcie i ponowne uruchomienie aplikacji.

const NOTIFICATION_KEY = 'rest_notification_id';
const CHANNEL_ID = 'rest-timer';
const WARNING_CHANNEL_ID = 'rest-warning';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: false,
  }),
});

let permissionChecked = false;

/** Pyta o zgodę na powiadomienia (Android 13+) i tworzy kanały. Zwraca true, gdy zgoda jest. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Koniec odliczania',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E5484D',
    });
    await Notifications.setNotificationChannelAsync(WARNING_CHANNEL_ID, {
      name: 'Dziesięć sekund do końca',
      importance: Notifications.AndroidImportance.HIGH,
      // Krótsze i pojedyncze drgnięcie: to jeszcze nie wezwanie pod sztangę, tylko zapowiedź.
      vibrationPattern: [0, 200],
      lightColor: '#F5A524',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (permissionChecked && !current.canAskAgain) return false;
  permissionChecked = true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Co odlicza: przerwa między seriami czy sama seria na czas. Treść musi to rozróżniać —
 * „Koniec przerwy” przy planku kazałoby wstać dokładnie wtedy, gdy trzeba jeszcze leżeć.
 */
export type CountdownKind = 'rest' | 'set';

const TEXTS: Record<CountdownKind, Record<CountdownNotification['kind'], [string, string]>> = {
  rest: {
    warning: ['Jeszcze 10 sekund przerwy', 'Zaraz kolejna seria'],
    end: ['Koniec przerwy', 'Czas na kolejną serię'],
  },
  set: {
    warning: ['Jeszcze 10 sekund', 'Wytrzymaj do końca'],
    end: ['Koniec serii', 'Możesz puścić'],
  },
};

const CHANNELS: Record<CountdownNotification['kind'], string> = {
  warning: WARNING_CHANNEL_ID,
  end: CHANNEL_ID,
};

/** Planuje ostrzeżenie i koniec odliczania, zastępując poprzednią parę. */
export async function scheduleCountdown(
  seconds: number,
  exerciseName: string,
  kind: CountdownKind = 'rest',
): Promise<void> {
  await cancelCountdown();
  const plan = countdownNotificationPlan(seconds);
  if (plan.length === 0) return;
  if (!(await ensureNotificationPermission())) return;

  const ids: string[] = [];
  for (const step of plan) {
    const [title, body] = TEXTS[kind][step.kind];
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: { title, body: `${body} — ${exerciseName}.`, sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: step.afterSeconds,
          channelId: CHANNELS[step.kind],
        },
      }),
    );
  }
  // Oba identyfikatory w jednym wpisie: odliczanie ma jedną parę sygnałów i odwołuje się je razem.
  setSetting(db, NOTIFICATION_KEY, ids.join(' '));
}

export async function cancelCountdown(): Promise<void> {
  const stored = getSetting(db, NOTIFICATION_KEY);
  if (!stored) return;
  setSetting(db, NOTIFICATION_KEY, null);
  // Rozdzielenie odczytuje też pojedynczy identyfikator zapisany przez starszą wersję.
  for (const id of stored.split(' ').filter(Boolean)) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {
      // Powiadomienie mogło już się pokazać albo zostać usunięte — nic nie trzeba robić.
    });
  }
}
