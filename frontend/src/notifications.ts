import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Foreground handler so notifications also show while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNEL_ID = "tracepro-controls";

export async function ensureAndroidChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Rappels de contrôle",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#E65100",
    });
  }
}

export async function getPermissionStatus() {
  const settings = await Notifications.getPermissionsAsync();
  return settings; // { status, canAskAgain, ... }
}

export async function requestPermission() {
  const res = await Notifications.requestPermissionsAsync();
  return res;
}

function parseHM(t: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

// Cancel all and reschedule from config — guarantees no duplicate notifications.
export async function rescheduleReminders(cfg: any): Promise<number> {
  await ensureAndroidChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!cfg) return 0;
  let count = 0;

  const schedule = async (title: string, body: string, hm: { hour: number; minute: number }) => {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}) },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hm.hour,
        minute: hm.minute,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      } as any,
    });
    count++;
  };

  if (cfg.temperature_enabled) {
    for (const t of cfg.temperature_times || []) {
      const hm = parseHM(t);
      if (hm) await schedule("TRACEPRO — Contrôle température", `Relevé de température prévu à ${t}`, hm);
    }
  }
  if (cfg.cleaning_enabled) {
    const hm = parseHM(cfg.cleaning_time || "");
    if (hm) await schedule("TRACEPRO — Nettoyage", `Nettoyage & désinfection à effectuer avant ${cfg.cleaning_time}`, hm);
  }
  for (const c of cfg.custom_controls || []) {
    const hm = parseHM(c.time || "");
    if (hm && c.name) await schedule(`TRACEPRO — ${c.name}`, `Contrôle « ${c.name} » prévu à ${c.time}`, hm);
  }
  return count;
}

export async function getScheduledCount(): Promise<number> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.length;
}
