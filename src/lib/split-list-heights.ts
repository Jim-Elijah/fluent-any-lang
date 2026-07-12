/**
 * Split available vertical space between two stacked lists.
 * Prefer fully fitting the shorter list; give leftover to the longer one.
 * When neither fits, split proportionally with a minimum for each.
 */
export function allocateStackedHeights(
  naturalA: number,
  naturalB: number,
  available: number,
  minScrollable = 120,
): [number, number] {
  if (available <= 0) return [0, 0];

  const a = Math.max(0, naturalA);
  const b = Math.max(0, naturalB);

  if (a + b <= available) {
    return [a, b];
  }

  const minEach = Math.min(minScrollable, available / 2);

  if (a <= b && a <= available - minEach) {
    return [a, available - a];
  }
  if (b < a && b <= available - minEach) {
    return [available - b, b];
  }

  const total = a + b || 1;
  let allocA = (available * a) / total;
  let allocB = available - allocA;

  if (allocA < minEach) {
    allocA = minEach;
    allocB = available - allocA;
  } else if (allocB < minEach) {
    allocB = minEach;
    allocA = available - allocB;
  }

  return [allocA, allocB];
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
