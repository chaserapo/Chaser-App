import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { supabase } from "./supabase";

try {
  // Guarded: this runs at module-import time, before any component mounts.
  // A binary built before expo-notifications was added has no native module
  // for this to call into — this must not be allowed to crash app startup.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  console.warn("setNotificationHandler failed (native module unavailable?)", e);
}

export type ChaserNotificationData = {
  type: "overdue_maintenance" | "open_fault" | "spray_window" | "frost" | "wind_max" | "rain_change" | "rain_after_spray" | "job_due_today";
  machineryId?: string;
  farmId?: string;
  jobId?: string;
};

const projectId = Constants.expoConfig?.extra?.eas?.projectId;

export async function registerPushToken(userId: string, businessId: string): Promise<void> {
  if (!projectId) return;
  try {
    const perms = await Notifications.getPermissionsAsync();
    let status = perms.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Chaser alerts",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    await supabase.from("push_tokens").upsert(
      { token, business_id: businessId, user_id: userId, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: "token" },
    );
  } catch (e) {
    console.warn("registerPushToken failed", e);
  }
}

export function useNotificationRouting() {
  const router = useRouter();
  useEffect(() => {
    try {
      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as ChaserNotificationData | undefined;
        if (data?.machineryId) {
          router.push({ pathname: "/machinery/[id]", params: { id: data.machineryId } });
        } else if (data?.type === "rain_after_spray" && data.jobId) {
          router.push({ pathname: "/records/[id]", params: { id: data.jobId } });
        } else if (data?.type === "job_due_today" && data.jobId) {
          router.push({ pathname: "/records/new", params: { plannedId: data.jobId } });
        } else if (data?.type && ["spray_window", "frost", "wind_max", "rain_change"].includes(data.type)) {
          router.push("/(tabs)/weather");
        }
      });
      return () => sub.remove();
    } catch (e) {
      console.warn("notification response listener failed (native module unavailable?)", e);
      return undefined;
    }
  }, [router]);
}
