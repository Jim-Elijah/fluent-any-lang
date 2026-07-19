/** Min height for a stacked list pane (section header ≈40px + ~1 row). */
export const MIN_STACKED_LIST_PX = 140;

/** Noise is secondary: when competing for space, prefer at most this many rows. */
export const MAX_NOISE_STACK_ROWS = 2;

/** Matches noise/media/record desktop row height used for natural estimates. */
export const STACK_LIST_ROW_PX = 88;

/**
 * Split available vertical space between two stacked lists.
 * Prefer fully fitting the shorter list; give leftover to the longer one.
 * When neither fits, split remaining space equally (with a per-list minimum).
 */
export function allocateStackedHeights(
  naturalA: number,
  naturalB: number,
  available: number,
  minScrollable = MIN_STACKED_LIST_PX,
): [number, number] {
  const [a, b] = allocateStackedHeightsN([naturalA, naturalB], available, minScrollable);
  return [a ?? 0, b ?? 0];
}

/**
 * Split available vertical space across N stacked lists.
 * Fits lists that wholly fit (shortest first); remaining space is shared
 * equally among the rest so a long list cannot starve a later one.
 */
export function allocateStackedHeightsN(
  naturals: number[],
  available: number,
  minScrollable = MIN_STACKED_LIST_PX,
): number[] {
  const n = naturals.length;
  if (n === 0) return [];
  if (available <= 0) return naturals.map(() => 0);

  const values = naturals.map((v) => Math.max(0, v));
  const totalNatural = values.reduce((sum, v) => sum + v, 0);
  if (totalNatural <= available) {
    return values;
  }

  const minEach = Math.min(minScrollable, available / n);
  const alloc = new Array<number>(n).fill(0);
  const remainingIdx = new Set(values.map((_, i) => i));
  let remainingSpace = available;

  // Greedily assign lists that fit while leaving minEach for each other remaining list.
  let progressed = true;
  while (progressed && remainingIdx.size > 0) {
    progressed = false;
    const ordered = [...remainingIdx].sort((a, b) => values[a] - values[b]);
    for (const i of ordered) {
      const others = remainingIdx.size - 1;
      const reserve = others * minEach;
      if (values[i] <= remainingSpace - reserve) {
        alloc[i] = values[i];
        remainingSpace -= values[i];
        remainingIdx.delete(i);
        progressed = true;
        break;
      }
    }
  }

  if (remainingIdx.size === 0) {
    return alloc;
  }

  // Equal shares among panes that still need to scroll (avoids starving the last list).
  const flexible = [...remainingIdx];
  let used = 0;
  for (let k = 0; k < flexible.length; k += 1) {
    const i = flexible[k];
    const isLast = k === flexible.length - 1;
    alloc[i] = isLast ? remainingSpace - used : remainingSpace / flexible.length;
    used += alloc[i];
  }

  return alloc;
}

/**
 * Library media / record / noise stack: give media/record first claim on leftover
 * space after reserving up to {@link MAX_NOISE_STACK_ROWS} for noise; noise may
 * expand further when primary panes already fit.
 */
export function allocateLibraryStackHeights(
  mediaNatural: number,
  recordNatural: number,
  noiseNatural: number,
  available: number,
  minScrollable = MIN_STACKED_LIST_PX,
): [number, number, number] {
  if (available <= 0) return [0, 0, 0];

  const mediaN = Math.max(0, mediaNatural);
  const recordN = Math.max(0, recordNatural);
  const noiseN = Math.max(0, noiseNatural);
  const maxNoise = estimateListNaturalHeight({
    itemCount: MAX_NOISE_STACK_ROWS,
    rowHeight: STACK_LIST_ROW_PX,
  });
  // Prefer at least ~2 noise rows while competing; residual goes to media/record.
  const noiseReserve = Math.min(noiseN, maxNoise);

  let [media, record] = allocateStackedHeights(
    mediaN,
    recordN,
    Math.max(0, available - noiseReserve),
    minScrollable,
  );

  let leftover = available - media - record;
  let noise = Math.min(leftover, noiseN, maxNoise);
  leftover = available - media - record - noise;

  if (leftover > 0) {
    const growMedia = Math.min(leftover, Math.max(0, mediaN - media));
    media += growMedia;
    leftover -= growMedia;
    const growRecord = Math.min(leftover, Math.max(0, recordN - record));
    record += growRecord;
    leftover -= growRecord;
    noise = Math.min(noiseN, noise + leftover);
  }

  return [media, record, noise];
}

export type ListNaturalHeightOptions = {
  itemCount: number;
  rowHeight: number;
  hasHeader?: boolean;
  hasError?: boolean;
  loading?: boolean;
};

/** Approximate total height for a list section (header + body / empty state). */
export function estimateListNaturalHeight(options: ListNaturalHeightOptions): number {
  const header = options.hasHeader === false ? 0 : 40;
  const error = options.hasError ? 48 : 0;
  const body =
    options.loading || options.itemCount <= 0 ? 88 : options.itemCount * options.rowHeight;
  return header + error + body;
}

export type ListMetricsDetail = {
  naturalHeight: number;
  itemCount: number;
};
