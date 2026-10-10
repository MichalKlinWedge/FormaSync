import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { db } from '@/db/client';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { todayKey } from '@/lib/date';

import { describeReminder, expectedAt } from './day';
import { consumedOn, extraOn, latestWeightKg, trainingSecondsOn } from './repository';
import { reminderSlots, slotsToRemind } from './schedule';
import { loadHydrationSettings } from './settings';
import { dailyTarget } from './target';

const CHANNEL_ID = 'hydration-reminders';
const REMINDER_TYPE = 'hydration-reminder';

/**
 * Ustawia przypomnienia o piciu na resztę dnia.
 *
 * Przypominamy wyłącznie wtedy, gdy jesteś poniżej kreski — i to jest jedyna rzecz, która
 * odróżnia funkcję używaną po miesiącu od wyłączonej w trzeci dzień. Warunku nie da się sprawdzić
 * w chwili odpalenia alarmu, więc sprawdzamy go przy planowaniu i planujemy od nowa po każdej
 * wypitej porcji oraz przy starcie aplikacji. Wypicie szklanki samo zdejmuje najbliższe
 * przypomnienia, a Android i tak kasuje zaplanowane alarmy przy aktualizacji.
 *
 * Swoje powiadomienia rozpoznajemy po znaczniku w `data`, żeby nie ruszyć sygnału końca przerwy
 * ani przypomnień o treningu.
 */
export async function syncHydrationReminders(now: Date = new Date()): Promise<number> {
  await cancelAllHydrationReminders();

  const settings = loadHydrationSettings(db);
  if (!settings.reminders) return 0;

  const today = todayKey(now);
  const consumed = consumedOn(db, today);
  const target = dailyTarget({
    weightKg: latestWeightKg(db),
    manualMl: settings.manualMl,
    trainingSeconds: trainingSecondsOn(db, today),
    extraMl: extraOn(db, today),
  }).total;

  // Cel dowieziony — na dziś nie ma o czym przypominać.
  if (consumed >= target) return 0;

  const slots = slotsToRemind(
    reminderSlots(settings.window, settings.everyMinutes, now),
    consumed,
    target,
    settings.window,
    now,
  );
  if (slots.length === 0) return 0;
  if (!(await ensureNotificationPermission())) return 0;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Przypomnienia o piciu',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#2a78d6',
    });
  }

  let scheduled = 0;
  for (const slot of slots) {
    const missing = Math.max(0, expectedAt(target, settings.window, slot) - consumed);
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Napij się',
          body: describeReminder(missing, target - consumed),
          data: { type: REMINDER_TYPE },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: slot,
          channelId: CHANNEL_ID,
        },
      });
      scheduled += 1;
    } catch {
      // Jedno nieudane przypomnienie nie może przerwać planowania pozostałych.
    }
  }
  return scheduled;
}

async function cancelAllHydrationReminders(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const request of all) {
    if (request.content.data?.type !== REMINDER_TYPE) continue;
    await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => {});
  }
}
