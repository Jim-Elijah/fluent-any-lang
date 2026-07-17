/** Min px for a fill-height list before falling back to page scroll. */
export const MIN_FILL_LIST_PX = 200;

/** Hysteresis: estimated leftover needed to leave compact / fill-height mode. */
export const EXIT_FILL_LIST_PX = 280;

/** Min vertical budget for library's stacked lists before compact. */
export const MIN_LIBRARY_STACK_PX = 280;

/** Hysteresis to leave library compact mode. */
export const EXIT_LIBRARY_STACK_PX = 360;

/** Short viewport fallback (matches prior compact MQ). */
export const COMPACT_VIEWPORT_MQ = '(max-height: 739px)';

/** Narrow screen: list rows stack actions under text. */
export const NARROW_VIEWPORT_MQ = '(max-width: 767px)';

/**
 * Vertical space inside `.main-content` for a routed page host (below the app header).
 * Returns 0 when the page is not mounted under the app shell.
 */
export function measurePageViewportHeight(pageHost: HTMLElement): number {
  const main = pageHost.parentElement;
  const mainContent = main?.parentElement;
  if (!mainContent) return 0;

  const header = mainContent.querySelector(':scope > header');
  const cs = getComputedStyle(mainContent);
  const pad = (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
  const headerH = header instanceof HTMLElement ? header.offsetHeight : 0;
  const headerMb =
    header instanceof HTMLElement
      ? Number.parseFloat(getComputedStyle(header).marginBottom) || 0
      : 0;

  return Math.max(0, mainContent.clientHeight - pad - headerH - headerMb);
}

export function sumOffsetHeights(elements: Iterable<Element>): number {
  let total = 0;
  for (const el of elements) {
    if (el instanceof HTMLElement) total += el.offsetHeight;
  }
  return total;
}

export function gapPx(el: Element | null | undefined, fallback = 16): number {
  if (!el) return fallback;
  const raw = getComputedStyle(el).gap || getComputedStyle(el).rowGap;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
