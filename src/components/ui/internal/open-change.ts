export type OpenChangeMeta = {
  trigger?: string;
  reason?: string;
  source?: string;
};

export type EmitOpenChangeOptions = {
  /** Custom detail factory; receives `next` and `meta`. */
  detail?: (next: boolean, meta: OpenChangeMeta) => unknown;
  /** Skip `open` / `close` lifecycle events (e.g. when caller handles them). */
  skipLifecycle?: boolean;
};

/** Unified open-change / update:open (+ optional open/close) dispatch for overlay components. */
export function emitOpenChange(
  host: HTMLElement,
  next: boolean,
  meta: OpenChangeMeta = {},
  options: EmitOpenChangeOptions = {},
): void {
  const detail = options.detail
    ? options.detail(next, meta)
    : next
      ? { open: true, ...meta }
      : { open: false, ...meta };

  host.dispatchEvent(new CustomEvent('open-change', { detail, bubbles: true, composed: true }));
  host.dispatchEvent(new CustomEvent('update:open', { detail, bubbles: true, composed: true }));

  if (options.skipLifecycle) {
    return;
  }

  if (next) {
    host.dispatchEvent(new CustomEvent('open', { detail: meta, bubbles: true, composed: true }));
  } else {
    host.dispatchEvent(new CustomEvent('close', { detail: meta, bubbles: true, composed: true }));
  }
}
