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

let hasConfigured = false;
let configuredForUserId: string | null = null;

// RevenueCat's SDK expects Purchases.configure() to run exactly once per
// app lifecycle (typically at first launch); switching which user is
// "logged in" afterward is meant to go through logIn()/logOut(), not a
// second configure() call — re-configuring is RevenueCat's own
// unsupported way to switch identities, and risks a window where stale
// cached entitlement data from the previous user is read before the SDK's
// listener catches up. Matters for a shared device: User A signs out,
// User B signs in, both hit this function with different userIds.
export async function configurePurchases(userId: string): Promise<void> {
  if (!purchasesConfigured() || configuredForUserId === userId) return;
  try {
    const Purchases = require("react-native-purchases").default;
    if (!hasConfigured) {
      Purchases.configure({ apiKey: currentApiKey()!, appUserID: userId });
      hasConfigured = true;
    } else {
      await Purchases.logIn(userId);
    }
    configuredForUserId = userId;
  } catch (e) {
    console.warn("RevenueCat configure failed", e);
  }
}

/** Call on sign-out so the next configurePurchases() for a different user logs in cleanly rather than re-configuring. */
export async function logOutPurchases(): Promise<void> {
  if (!purchasesConfigured() || !hasConfigured) return;
  try {
    const Purchases = require("react-native-purchases").default;
    await Purchases.logOut();
    configuredForUserId = null;
  } catch (e) {
    console.warn("RevenueCat logOut failed", e);
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

export type EntitlementState = {
  loading: boolean;
  /** Has an active RevenueCat entitlement — covers both the platform-managed free trial and a paid period. */
  isPro: boolean;
  /** isPro is true because of the platform's free-trial phase specifically, not a paid period yet. */
  isTrialing: boolean;
  /** ISO date the current trial/billing period ends, from the store — null when not known or not entitled. */
  periodEndsAt: string | null;
  showPaywall: boolean;
};

type RawEntitlement = { isPro: boolean; isTrialing: boolean; periodEndsAt: string | null };

const EMPTY_ENTITLEMENT: RawEntitlement = { isPro: false, isTrialing: false, periodEndsAt: null };

function readEntitlement(info: any): RawEntitlement {
  const ent = info?.entitlements?.active?.[PRO_ENTITLEMENT_ID];
  if (!ent) return EMPTY_ENTITLEMENT;
  return { isPro: true, isTrialing: ent.periodType === "trial", periodEndsAt: ent.expirationDate ?? null };
}

/**
 * Tracks the signed-in user's subscription state via RevenueCat/the store,
 * not a self-counted window — the 7-day free trial is configured as an
 * actual introductory offer on the subscription product (Play Console /
 * App Store Connect), so the platform starts billing automatically when it
 * ends unless the user cancels. isPro is true for the whole trial, same as
 * a paid period, since the store — not this app — owns that clock.
 */
export function useEntitlement(): EntitlementState {
  const [{ isPro, isTrialing, periodEndsAt }, setEntitlement] = useState(EMPTY_ENTITLEMENT);
  const [loading, setLoading] = useState(purchasesConfigured());
  // Could not confirm entitlement status at all (e.g. flaky connection on
  // launch) — distinct from "confirmed not pro". Without this, a paying
  // subscriber would get locked out by a transient network error with no
  // retry, since isPro's default is false. Keep the paywall off until we
  // actually know, same "never lock someone out on an error" stance as
  // purchasesConfigured()'s own safe-default gating.
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    // loading's initial state already matches purchasesConfigured(), so
    // nothing to set here when it's false.
    if (!purchasesConfigured()) return;
    let mounted = true;
    let purchasesRef: any;
    let listenerRef: ((info: any) => void) | undefined;

    async function run() {
      // Unlike every other require() in this file, this one previously
      // wasn't wrapped — this hook mounts unconditionally for every
      // signed-in user once a key is configured, so a missing/unlinked
      // native module here would throw straight out of a useEffect with
      // nothing to catch it, crashing the whole post-login app shell
      // instead of staying a safe no-op.
      let Purchases: any;
      try {
        Purchases = require("react-native-purchases").default;
        purchasesRef = Purchases;
      } catch (e) {
        console.warn("RevenueCat module unavailable", e);
        return;
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const info = await Purchases.getCustomerInfo();
          if (mounted) { setEntitlement(readEntitlement(info)); setFetchFailed(false); }
          break;
        } catch (e) {
          if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
          else { console.warn("RevenueCat getCustomerInfo failed twice", e); if (mounted) setFetchFailed(true); }
        }
      }

      const listener = (info: any) => { setEntitlement(readEntitlement(info)); setFetchFailed(false); };
      listenerRef = listener;
      try {
        Purchases.addCustomerInfoUpdateListener(listener);
      } catch (e) {
        console.warn("RevenueCat addCustomerInfoUpdateListener failed", e);
      }
    }
    run().finally(() => { if (mounted) setLoading(false); });

    return () => {
      mounted = false;
      if (purchasesRef && listenerRef) {
        try { purchasesRef.removeCustomerInfoUpdateListener(listenerRef); } catch { /* module already gone */ }
      }
    };
  }, []);

  if (!purchasesConfigured()) {
    return { loading: false, isPro: true, isTrialing: false, periodEndsAt: null, showPaywall: false };
  }

  return {
    loading,
    isPro,
    isTrialing,
    periodEndsAt,
    showPaywall: !loading && !fetchFailed && !isPro,
  };
}
