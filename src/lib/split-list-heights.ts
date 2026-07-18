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
  const [a, b] = allocateStackedHeightsN([naturalA, naturalB], available, minScrollable);
  return [a ?? 0, b ?? 0];
}

/**
 * Split available vertical space across N stacked lists.
 * Fits lists that wholly fit (shortest first); remaining space is shared
 * proportionally among the rest, respecting a per-list minimum.
 */
export function allocateStackedHeightsN(
  naturals: number[],
  available: number,
  minScrollable = 120,
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

  const remTotal = [...remainingIdx].reduce((sum, i) => sum + values[i], 0) || 1;
  const flexible = [...remainingIdx];
  let used = 0;
  for (let k = 0; k < flexible.length; k += 1) {
    const i = flexible[k];
    const isLast = k === flexible.length - 1;
    let share = isLast ? remainingSpace - used : (remainingSpace * values[i]) / remTotal;
    share = Math.max(minEach, share);
    alloc[i] = share;
    used += share;
  }

  // If mins overshot, scale flexible shares down proportionally into remainingSpace.
  const flexSum = flexible.reduce((sum, i) => sum + alloc[i], 0);
  if (flexSum > remainingSpace && flexSum > 0) {
    let scaledUsed = 0;
    for (let k = 0; k < flexible.length; k += 1) {
      const i = flexible[k];
      const isLast = k === flexible.length - 1;
      alloc[i] = isLast ? remainingSpace - scaledUsed : (remainingSpace * alloc[i]) / flexSum;
      scaledUsed += alloc[i];
    }
  }

  return alloc;
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
