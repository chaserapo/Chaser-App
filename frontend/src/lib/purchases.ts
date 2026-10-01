// RevenueCat subscription integration.
//
// Gated entirely behind the current platform's EXPO_PUBLIC_REVENUECAT_*_KEY
// being set: until that env var is added for a given platform (in eas.json,
// once you've created the matching RevenueCat app + store subscription
// product), every function here is a safe no-op on that platform and
// isPro() always returns true — nobody gets locked out of an app that isn't
// wired up to actually sell anything yet there. Once a platform's key is
// added, the 7-day trial (counted from the business's created_at) and
// paywall gate turn on automatically for that platform — no other code
// change needed.

import { useEffect, useState } from "react";
import { Platform } from "react-native";

export const PRO_ENTITLEMENT_ID = "chaser";
export const TRIAL_DAYS = 7;

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

function currentApiKey(): string | undefined {
  if (Platform.OS === "ios") return IOS_API_KEY;
  if (Platform.OS === "android") return ANDROID_API_KEY;
  return undefined;
}

export function purchasesConfigured(): boolean {
  return !!currentApiKey();
}

let configuredForUserId: string | null = null;

export async function configurePurchases(userId: string): Promise<void> {
  if (!purchasesConfigured() || configuredForUserId === userId) return;
  try {
    const Purchases = require("react-native-purchases").default;
    Purchases.configure({ apiKey: currentApiKey()!, appUserID: userId });
    configuredForUserId = userId;
  } catch (e) {
    console.warn("RevenueCat configure failed", e);
  }
}

export async function getOfferings(): Promise<any | null> {
  if (!purchasesConfigured()) return null;
  try {
    const Purchases = require("react-native-purchases").default;
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (e) {
    console.warn("RevenueCat getOfferings failed", e);
    return null;
  }
}

export async function purchasePackage(pkg: any): Promise<{ ok: boolean; message?: string }> {
  try {
    const Purchases = require("react-native-purchases").default;
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = !!customerInfo.entitlements.active[PRO_ENTITLEMENT_ID];
    return { ok: active, message: active ? undefined : "Purchase completed but entitlement isn't active yet." };
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false };
    return { ok: false, message: e?.message ?? "Purchase failed" };
  }
}

export async function restorePurchases(): Promise<{ ok: boolean; message?: string }> {
  try {
    const Purchases = require("react-native-purchases").default;
    const customerInfo = await Purchases.restorePurchases();
    const active = !!customerInfo.entitlements.active[PRO_ENTITLEMENT_ID];
    return { ok: active, message: active ? undefined : "No active subscription found for this account." };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Restore failed" };
  }
}

/** Opens the platform's native "manage subscription" flow (cancel, upgrade, billing history). */
export async function presentCustomerCenter(): Promise<void> {
  if (!purchasesConfigured()) return;
  try {
    const RevenueCatUI = require("react-native-purchases-ui").default;
    await RevenueCatUI.presentCustomerCenter();
  } catch (e) {
    console.warn("RevenueCat presentCustomerCenter failed", e);
  }
}

function trialDaysLeft(businessCreatedAt: string | null): number {
  if (!businessCreatedAt) return TRIAL_DAYS;
  const startMs = new Date(businessCreatedAt).getTime();
  const elapsedDays = (Date.now() - startMs) / 86_400_000;
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
}

export type EntitlementState = {
  loading: boolean;
  isPro: boolean;
  trialDaysLeft: number;
  isTrialActive: boolean;
  showPaywall: boolean;
};

/** Tracks the signed-in user's subscription state against the business's trial window. */
export function useEntitlement(businessCreatedAt: string | null): EntitlementState {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(purchasesConfigured());

  useEffect(() => {
    // loading's initial state already matches purchasesConfigured(), so
    // nothing to set here when it's false.
    if (!purchasesConfigured()) return;
    let mounted = true;
    const Purchases = require("react-native-purchases").default;

    Purchases.getCustomerInfo()
      .then((info: any) => { if (mounted) setIsPro(!!info.entitlements.active[PRO_ENTITLEMENT_ID]); })
      .catch((e: any) => console.warn("RevenueCat getCustomerInfo failed", e))
      .finally(() => { if (mounted) setLoading(false); });

    const listener = (info: any) => setIsPro(!!info.entitlements.active[PRO_ENTITLEMENT_ID]);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => { mounted = false; Purchases.removeCustomerInfoUpdateListener(listener); };
  }, []);

  if (!purchasesConfigured()) {
    return { loading: false, isPro: true, trialDaysLeft: TRIAL_DAYS, isTrialActive: true, showPaywall: false };
  }

  const daysLeft = trialDaysLeft(businessCreatedAt);
  const isTrialActive = daysLeft > 0;
  return {
    loading,
    isPro,
    trialDaysLeft: daysLeft,
    isTrialActive,
    showPaywall: !loading && !isPro && !isTrialActive,
  };
}
