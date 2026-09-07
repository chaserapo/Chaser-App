// Backend router: chooses which repo implementation to use.
// This module is intentionally tiny + framework-agnostic so it can be imported by
// any layer (storage router, migration, cloud repo) without cycles.

type Mode = "local" | "cloud";

let currentMode: Mode = "local";
let currentBusinessId: string | null = null;
const listeners = new Set<() => void>();

export function getBackendMode(): Mode {
  return currentMode;
}

export function getActiveBusinessId(): string | null {
  return currentBusinessId;
}

export function setBackend(mode: Mode, businessId?: string | null) {
  currentMode = mode;
  currentBusinessId = businessId ?? null;
  listeners.forEach((fn) => {
    try { fn(); } catch { /* noop */ }
  });
}

export function subscribeBackend(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
