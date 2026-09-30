import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { db } from '@/db/client';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { formatDayWithWeekday } from '@/lib/date';

import { listPendingReminders, setReminderNotificationId } from './repository';

const CHANNEL_ID = 'workout-reminders';
const REMINDER_TYPE = 'workout-reminder';

/**
 * Ustawia lokalne przypomnienia o zaplanowanych treningach.
 *
 * Android kasuje zaplanowane alarmy przy aktualizacji aplikacji, a użytkownik może w międzyczasie
 * zmienić harmonogram, więc za każdym razem kasujemy wszystkie nasze przypomnienia i planujemy je
 * od nowa. Rozpoznajemy je po znaczniku w `data`, dzięki czemu nie ruszamy sygnału końca przerwy
 * ani nie zostawiają się osierocone powiadomienia po usuniętych planach.
 */
export async function syncWorkoutReminders(now: Date = new Date()): Promise<number> {
  await cancelAllWorkoutReminders();

  const pending = listPendingReminders(db, now);
  if (pending.length === 0) return 0;
  if (!(await ensureNotificationPermission())) return 0;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Przypomnienia o treningu',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#E5484D',
    });
  }

  let scheduled = 0;
  for (const reminder of pending) {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Czas na trening',
          body: `${reminder.planTitle} — ${formatDayWithWeekday(reminder.scheduledDate)}${
            reminder.scheduledTime ? ` o ${reminder.scheduledTime}` : ''
          }.`,
          data: { type: REMINDER_TYPE, scheduledId: reminder.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.remindAt,
          channelId: CHANNEL_ID,
        },
      });
      setReminderNotificationId(db, reminder.id, id);
      scheduled += 1;
    } catch {
      // Pojedyncze nieudane przypomnienie nie może przerwać planowania pozostałych.
      setReminderNotificationId(db, reminder.id, null);
    }
  }
  return scheduled;
}

async function cancelAllWorkoutReminders(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const request of all) {
    if (request.content.data?.type !== REMINDER_TYPE) continue;
    await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => {});
  }
}
