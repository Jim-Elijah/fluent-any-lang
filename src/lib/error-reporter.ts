import { addErrorLog } from '../db/error-log.js';
import type { ErrorLogEntry, ErrorLogSource } from '../types/models.js';
import { getAppBuildInfo } from './app-build-info.js';

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_STACK_LENGTH = 8_000;
const MAX_CAUSE_LENGTH = 1_000;
const MAX_EXTRA_JSON_LENGTH = 4_000;
const LOCALE_STORAGE_KEY = 'fluent-any-lang:locale';

let handlersInstalled = false;
let writing = false;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function readLocale(): string {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) || 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

function safeStringifyExtra(
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!extra || Object.keys(extra).length === 0) return undefined;
  try {
    const json = JSON.stringify(extra);
    if (json.length <= MAX_EXTRA_JSON_LENGTH) {
      return extra;
    }
    return { truncated: true, preview: truncate(json, MAX_EXTRA_JSON_LENGTH) };
  } catch {
    return { unserializable: true };
  }
}

export function normalizeError(error: unknown): {
  message: string;
  name?: string;
  stack?: string;
  cause?: string;
} {
  if (error instanceof Error) {
    const cause =
      error.cause !== undefined && error.cause !== null
        ? truncate(String(error.cause), MAX_CAUSE_LENGTH)
        : undefined;
    return {
      message: truncate(error.message || error.name || 'Error', MAX_MESSAGE_LENGTH),
      name: error.name,
      stack: error.stack ? truncate(error.stack, MAX_STACK_LENGTH) : undefined,
      cause,
    };
  }

  if (typeof error === 'string') {
    return { message: truncate(error, MAX_MESSAGE_LENGTH) };
  }

  try {
    return { message: truncate(JSON.stringify(error) || String(error), MAX_MESSAGE_LENGTH) };
  } catch {
    return { message: truncate(String(error), MAX_MESSAGE_LENGTH) };
  }
}

function currentRoute(): string {
  if (typeof location === 'undefined') return '';
  return location.pathname || '/';
}

function buildEntry(
  error: unknown,
  source: ErrorLogSource,
  extra?: Record<string, unknown>,
): ErrorLogEntry {
  const normalized = normalizeError(error);
  const build = getAppBuildInfo();
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    message: normalized.message,
    name: normalized.name,
    stack: normalized.stack,
    cause: normalized.cause,
    source,
    appVersion: build.appVersion,
    commitHash: build.commitHash,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    locale: readLocale(),
    route: currentRoute(),
    href: typeof location !== 'undefined' ? location.href : '',
    offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
    extra: safeStringifyExtra(extra),
  };
}

/**
 * Persist an error to IndexedDB. Failures fall back to console.error only
 * (never re-enter reportError) to avoid recursive logging.
 */
export async function reportError(
  error: unknown,
  extra?: Record<string, unknown>,
  source: ErrorLogSource = 'reportError',
): Promise<void> {
  if (writing) {
    console.error('[error-reporter] nested report skipped', error, extra);
    return;
  }

  writing = true;
  try {
    const entry = buildEntry(error, source, extra);
    await addErrorLog(entry);
  } catch (persistError) {
    console.error('[error-reporter] failed to persist error', persistError, error);
  } finally {
    writing = false;
  }
}

function onWindowError(event: ErrorEvent): void {
  const error = event.error ?? event.message ?? 'Unknown window error';
  void reportError(
    error,
    {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
    'window.onerror',
  );
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  void reportError(event.reason ?? 'Unhandled rejection', undefined, 'unhandledrejection');
}

/** Register global window error handlers once. Safe to call multiple times. */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled || typeof window === 'undefined') return;
  handlersInstalled = true;
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
}

/** Test-only: remove handlers and reset install flag. */
export function uninstallGlobalErrorHandlersForTests(): void {
  if (typeof window === 'undefined') return;
  window.removeEventListener('error', onWindowError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
  handlersInstalled = false;
  writing = false;
}
