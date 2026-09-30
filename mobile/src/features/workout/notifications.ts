import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { db } from '@/db/client';
import { getSetting, setSetting } from '@/db/settings';

// Sygnał końca przerwy musi zadziałać także przy wygaszonym ekranie, gdy Android wstrzymuje
// liczniki JS (R5 w planie). Dlatego planujemy lokalne powiadomienie z wyprzedzeniem,
// a identyfikator trzymamy w bazie — przeżywa zamknięcie i ponowne uruchomienie aplikacji.

const REST_NOTIFICATION_KEY = 'rest_notification_id';
const CHANNEL_ID = 'rest-timer';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: false,
  }),
});

let permissionChecked = false;

/** Pyta o zgodę na powiadomienia (Android 13+) i tworzy kanał. Zwraca true, gdy zgoda jest. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Koniec przerwy',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E5484D',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (permissionChecked && !current.canAskAgain) return false;
  permissionChecked = true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Planuje sygnał na koniec przerwy, zastępując poprzedni. */
export async function scheduleRestEnd(seconds: number, exerciseName: string): Promise<void> {
  await cancelRestEnd();
  if (seconds <= 0) return;
  if (!(await ensureNotificationPermission())) return;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Koniec przerwy',
      body: `Czas na kolejną serię — ${exerciseName}.`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.ceil(seconds),
      channelId: CHANNEL_ID,
    },
  });
  setSetting(db, REST_NOTIFICATION_KEY, id);
}

export async function cancelRestEnd(): Promise<void> {
  const id = getSetting(db, REST_NOTIFICATION_KEY);
  if (!id) return;
  setSetting(db, REST_NOTIFICATION_KEY, null);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {
    // Powiadomienie mogło już się pokazać albo zostać usunięte — nic nie trzeba robić.
  });
}
