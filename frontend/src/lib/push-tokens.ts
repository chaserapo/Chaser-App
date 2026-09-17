import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type ChaserNotificationData = {
  type: "overdue_maintenance" | "open_fault";
  machineryId?: string;
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
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as ChaserNotificationData | undefined;
      if (data?.machineryId) {
        router.push({ pathname: "/machinery/[id]", params: { id: data.machineryId } });
      }
    });
    return () => sub.remove();
  }, [router]);
}
