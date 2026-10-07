import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';

import { restNotificationPlan, type RestNotification } from './rest-cues';

// Sygnały przerwy muszą zadziałać także przy wygaszonym ekranie, gdy Android wstrzymuje
// liczniki JS (R5 w planie) — dzwonek i pikanie z ekranu trwającego treningu wtedy nie zabrzmią.
// Dlatego planujemy lokalne powiadomienia z wyprzedzeniem, a ich identyfikatory trzymamy
// w bazie — przeżywają zamknięcie i ponowne uruchomienie aplikacji.

const REST_NOTIFICATION_KEY = 'rest_notification_id';
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
      name: 'Koniec przerwy',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E5484D',
    });
    await Notifications.setNotificationChannelAsync(WARNING_CHANNEL_ID, {
      name: 'Dziesięć sekund do końca przerwy',
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

const CONTENT: Record<
  RestNotification['kind'],
  { title: string; body: (exerciseName: string) => string; channelId: string }
> = {
  warning: {
    title: 'Jeszcze 10 sekund',
    body: (exerciseName) => `Zaraz kolejna seria — ${exerciseName}.`,
    channelId: WARNING_CHANNEL_ID,
  },
  end: {
    title: 'Koniec przerwy',
    body: (exerciseName) => `Czas na kolejną serię — ${exerciseName}.`,
    channelId: CHANNEL_ID,
  },
};

/** Planuje ostrzeżenie i koniec przerwy, zastępując poprzednią parę. */
export async function scheduleRestEnd(seconds: number, exerciseName: string): Promise<void> {
  await cancelRestEnd();
  const plan = restNotificationPlan(seconds);
  if (plan.length === 0) return;
  if (!(await ensureNotificationPermission())) return;

  const ids: string[] = [];
  for (const { kind, afterSeconds } of plan) {
    const content = CONTENT[kind];
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: { title: content.title, body: content.body(exerciseName), sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: afterSeconds,
          channelId: content.channelId,
        },
      }),
    );
  }
  // Oba identyfikatory w jednym wpisie: przerwa ma jedną parę sygnałów i odwołuje się je razem.
  setSetting(db, REST_NOTIFICATION_KEY, ids.join(' '));
}

export async function cancelRestEnd(): Promise<void> {
  const stored = getSetting(db, REST_NOTIFICATION_KEY);
  if (!stored) return;
  setSetting(db, REST_NOTIFICATION_KEY, null);
  // Rozdzielenie odczytuje też pojedynczy identyfikator zapisany przez starszą wersję.
  for (const id of stored.split(' ').filter(Boolean)) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {
      // Powiadomienie mogło już się pokazać albo zostać usunięte — nic nie trzeba robić.
    });
  }
}
