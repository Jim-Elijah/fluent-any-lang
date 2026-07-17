/**
 * PWA registration and update state (vite-plugin-pwa prompt mode).
 */

export type PwaState = {
  needRefresh: boolean;
  offlineReady: boolean;
  /** True after registerPwa() has run (may still be a no-op in tests / unsupported browsers). */
  registered: boolean;
};

type PwaListener = (state: PwaState) => void;

let needRefresh = false;
let offlineReady = false;
let registered = false;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
const listeners = new Set<PwaListener>();

function getState(): PwaState {
  return { needRefresh, offlineReady, registered };
}

function notify(): void {
  const state = getState();
  for (const listener of listeners) {
    listener(state);
  }
}

export function getPwaState(): PwaState {
  return getState();
}

export function subscribePwa(listener: PwaListener): () => void {
  listeners.add(listener);
  listener(getState());
  return () => {
    listeners.delete(listener);
  };
}

export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const media = window.matchMedia?.('(display-mode: standalone)');
  if (media?.matches) return true;
  // iOS Safari
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

/**
 * Register the service worker (prompt strategy). Safe to call once from main.
 * No-ops when service workers are unavailable (e.g. unit tests).
 */
export function registerPwa(): void {
  if (registered) return;
  registered = true;

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    notify();
    return;
  }

  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          needRefresh = true;
          notify();
        },
        onOfflineReady() {
          offlineReady = true;
          notify();
        },
        onRegisteredSW(_swUrl, registration) {
          // Keep a handle for checkForPwaUpdate via registration
          void registration;
        },
      });
      notify();
    })
    .catch(() => {
      // virtual module missing in some test environments
      notify();
    });
}

/** Ask the browser to check for an updated service worker. */
export async function checkForPwaUpdate(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return false;
  await registration.update();
  // If a waiting worker appeared, onNeedRefresh should fire; also probe waiting.
  if (registration.waiting) {
    needRefresh = true;
    notify();
    return true;
  }
  return needRefresh;
}

/** Apply the waiting service worker and reload. */
export async function applyPwaUpdate(): Promise<void> {
  if (updateSW) {
    await updateSW(true);
    return;
  }
  // Fallback: tell waiting worker to skip waiting
  const registration = await navigator.serviceWorker?.getRegistration();
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  window.location.reload();
}

/** Acknowledge offline-ready toast so it is not shown again this session. */
export function clearOfflineReady(): void {
  if (!offlineReady) return;
  offlineReady = false;
  notify();
}

/** Dismiss the need-refresh banner without updating (user can update later from settings). */
export function dismissNeedRefresh(): void {
  if (!needRefresh) return;
  needRefresh = false;
  notify();
}
