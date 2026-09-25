// Lightweight, JS-only error logging.
//
// After @sentry/react-native's Session Replay component was found to crash
// the app on every launch (autolinked native code registered with React
// Native's New Architecture at boot, unfixable from JS config — see the PR
// that removed it), this deliberately avoids any native SDK. It only ever
// touches the existing Supabase client already used everywhere else in the
// app, so there's nothing new to autolink and nothing that can crash launch.
//
// This catches React render errors and uncaught JS exceptions — the most
// common real-world bug category. It cannot catch true native crashes
// (SIGSEGV etc.) — for those, Apple's own crash reporter (App Store Connect
// → your app → Crashes, or on-device Settings > Privacy & Security >
// Analytics & Improvements > Analytics Data) remains the source of truth.

import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export type ErrorLogKind = "render" | "js_exception";

// Session-level cap so a tight error loop can't flood the table.
const MAX_LOGS_PER_SESSION = 20;
let loggedCount = 0;

export function logClientError(kind: ErrorLogKind, error: unknown, extra?: string): void {
  try {
    if (loggedCount >= MAX_LOGS_PER_SESSION) return;
    loggedCount += 1;

    const err = error instanceof Error ? error : new Error(String(error));
    const row = {
      id: cryptoRandomId(),
      kind,
      message: err.message?.slice(0, 2000) ?? "Unknown error",
      stack: err.stack?.slice(0, 8000) ?? null,
      extra: extra?.slice(0, 4000) ?? null,
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? null,
      created_at: new Date().toISOString(),
    };

    // Fire-and-forget — logging a bug must never itself throw or block.
    supabase.from("client_error_logs").insert(row).then(
      () => {},
      () => {},
    );
  } catch {
    // Never let the logger be the thing that crashes.
  }
}

function cryptoRandomId(): string {
  // Good enough for a log row id — avoids pulling in the uuid package here.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Call once, near app startup, to catch uncaught JS exceptions globally. */
export function installGlobalErrorLogger(): void {
  const g: any = globalThis as any;
  if (!g.ErrorUtils?.setGlobalHandler) return;
  const original = g.ErrorUtils.getGlobalHandler?.();
  g.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    logClientError("js_exception", error, isFatal ? "fatal" : "non-fatal");
    original?.(error, isFatal);
  });
}
