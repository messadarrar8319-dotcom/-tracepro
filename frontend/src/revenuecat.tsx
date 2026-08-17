import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/src/auth";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro"; // entitlement_lookup_key from setup

// Native (iOS/Android) uses RevenueCat IAP. Web uses Stripe (see app/billing).
export const rcEnabled = Platform.OS !== "web";

function getRevenueCatApiKey() {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat public API keys not found — run the Setup section first");
  }
  if (Platform.OS === "web" || __DEV__) return REVENUECAT_TEST_API_KEY;
  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY;
  return REVENUECAT_TEST_API_KEY;
}

export function initializeRevenueCat() {
  if (!rcEnabled) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: getRevenueCatApiKey() });
}

function useSubscriptionContext() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const rcIdentityRef = useRef<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: () => Purchases.getCustomerInfo(),
    enabled: rcEnabled,
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    enabled: rcEnabled,
    staleTime: 300 * 1000,
  });

  // Reactive entitlement updates (purchases, restores, renewals, logIn/logOut).
  useEffect(() => {
    if (!rcEnabled) return;
    const listener = (info: CustomerInfo) =>
      queryClient.setQueryData(["revenuecat", "customer-info"], info);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => Purchases.removeCustomerInfoUpdateListener(listener);
  }, [queryClient]);

  // COMPULSORY identity binding on every auth path. Never swallow errors.
  useEffect(() => {
    if (!rcEnabled) return;
    (async () => {
      try {
        if (user?.id && rcIdentityRef.current !== user.id) {
          const { customerInfo } = await Purchases.logIn(user.id);
          rcIdentityRef.current = user.id;
          setIdentityError(null);
          // Seed cache immediately so the paywall reflects the bound identity.
          queryClient.setQueryData(["revenuecat", "customer-info"], customerInfo);
          queryClient.invalidateQueries({ queryKey: ["revenuecat", "offerings"] });
        } else if (!user?.id && rcIdentityRef.current) {
          await Purchases.logOut();
          rcIdentityRef.current = null;
          queryClient.invalidateQueries({ queryKey: ["revenuecat"] });
        }
      } catch (e) {
        setIdentityError(String(e));
      }
    })();
  }, [user?.id, queryClient]);

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      const id = (await Purchases.getCustomerInfo()).originalAppUserId;
      // On native we require a bound (non-anonymous) identity before purchasing so the
      // entitlement attaches to the right account. Web Test Store allows anonymous.
      if (Platform.OS !== "web" && id.startsWith("$RCAnonymousID:")) throw new Error("identity_not_ready");
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      queryClient.setQueryData(["revenuecat", "customer-info"], customerInfo);
      return customerInfo;
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const customerInfo = await Purchases.restorePurchases();
      queryClient.setQueryData(["revenuecat", "customer-info"], customerInfo);
      return customerInfo;
    },
  });

  const info = customerInfoQuery.data;
  const entitlement = info?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER];
  const isSubscribed = entitlement !== undefined;
  const originalAppUserId = info?.originalAppUserId;
  const isAnonymous = !originalAppUserId || originalAppUserId.startsWith("$RCAnonymousID:");
  // On native, identity must be non-anonymous; on web Test Store an anonymous id is acceptable.
  const identityReady = Platform.OS === "web" ? !!user?.id : !isAnonymous;

  // Is the current entitlement a free-trial period?
  const inTrial = entitlement?.periodType === "TRIAL" || entitlement?.periodType === "INTRO";
  const expirationDate = entitlement?.expirationDate || null;

  return {
    rcEnabled,
    customerInfo: info,
    offerings: offeringsQuery.data,
    isSubscribed,
    inTrial,
    expirationDate,
    identityReady,
    identityError,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    refetch: () => queryClient.invalidateQueries({ queryKey: ["revenuecat"] }),
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}
