import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { NetworkProvider } from "@/src/network";
import { api } from "@/src/api";
import { Platform } from "react-native";
import * as Notif from "@/src/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SubscriptionProvider, useSubscription, initializeRevenueCat } from "@/src/revenuecat";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

try {
  initializeRevenueCat();
} catch (err) {
  console.warn("RevenueCat unavailable:", err);
}

function AuthGate() {
  const { loading, user, subscription } = useAuth();
  const { isSubscribed, isLoading: subLoading, rcEnabled } = useSubscription();
  const router = useRouter();
  const segments = useSegments();
  const isWeb = Platform.OS === "web";

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !inAuth) { router.replace("/(auth)/login"); return; }
    if (user && inAuth) { router.replace("/(tabs)"); return; }

    if (user && !inAuth) {
      if (isWeb) {
        // Web: gate on the backend Stripe subscription (15-day trial then 12,99 €/mois).
        const onBilling = segments[0] === "billing" || segments[0] === "legal";
        const hasAccess = !!subscription?.has_access;
        if (!hasAccess && !onBilling) router.replace("/billing");
        else if (hasAccess && segments[0] === "billing") router.replace("/(tabs)");
      } else if (rcEnabled && !subLoading) {
        // Native: gate on the RevenueCat entitlement.
        const onPaywall = segments[0] === "paywall" || segments[0] === "legal";
        if (!isSubscribed && !onPaywall) router.replace("/paywall");
        else if (isSubscribed && segments[0] === "paywall") router.replace("/(tabs)");
      }
    }
  }, [loading, user, segments, isSubscribed, subLoading, rcEnabled, subscription, isWeb]);

  // Reschedule local reminders on launch/login (idempotent: cancels then reschedules).
  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    (async () => {
      try {
        const p = await Notif.getPermissionStatus();
        if (p.status !== "granted") return;
        const cfg = await api.remindersConfig();
        await Notif.rescheduleReminders(cfg);
      } catch {}
    })();
  }, [user]);

  if (loading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF" }}><ActivityIndicator size="large" color="#E65100" /></View>;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SubscriptionProvider>
              <NetworkProvider>
                <AuthGate />
              </NetworkProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
