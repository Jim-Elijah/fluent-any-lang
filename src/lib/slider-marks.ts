/**
 * Build sparse slider marks so labels do not crowd on narrow overlays (esp. mobile).
 * Always prefers the first and last in-range candidates; drops middles that sit
 * closer than `minGapFraction` of the [min, max] span to a kept neighbor.
 */
export function buildSparseMarks(
  min: number,
  max: number,
  candidates: ReadonlyArray<readonly [value: number, label: string]>,
  minGapFraction = 0.2,
): Record<number, string> {
  const span = Math.max(max - min, Number.EPSILON);
  const minGap = span * minGapFraction;

  const items = candidates
    .filter(([value]) => value >= min - 1e-9 && value <= max + 1e-9)
    .map(([value, label]) => [value, label] as const)
    .sort((a, b) => a[0] - b[0]);

  if (items.length === 0) {
    return {};
  }

  // Dedupe by value (keep first label).
  const unique: Array<readonly [number, string]> = [];
  for (const item of items) {
    const prev = unique[unique.length - 1];
    if (prev && Math.abs(prev[0] - item[0]) < 1e-9) {
      continue;
    }
    unique.push(item);
  }

  const selected: Array<readonly [number, string]> = [unique[0]!];
  const end = unique[unique.length - 1]!;

  for (let i = 1; i < unique.length - 1; i += 1) {
    const item = unique[i]!;
    const last = selected[selected.length - 1]!;
    if (item[0] - last[0] >= minGap && end[0] - item[0] >= minGap) {
      selected.push(item);
    }
  }

  if (Math.abs(selected[selected.length - 1]![0] - end[0]) > 1e-9) {
    if (end[0] - selected[selected.length - 1]![0] >= minGap) {
      selected.push(end);
    } else {
      // Prefer the true max endpoint over a crowded neighbor.
      selected[selected.length - 1] = end;
    }
  }

  return Object.fromEntries(selected);
}

/**
 * Pick marks by priority tiers: higher tiers win seats first; later tiers only
 * fill gaps that still clear `minGapFraction` of the [min, max] span.
 */
function buildTieredSparseMarks(
  min: number,
  max: number,
  tiers: ReadonlyArray<ReadonlyArray<readonly [value: number, label: string]>>,
  minGapFraction = 0.2,
): Record<number, string> {
  const span = Math.max(max - min, Number.EPSILON);
  const minGap = span * minGapFraction;
  const selected: Array<readonly [number, string]> = [];

  const fits = (value: number) => selected.every(([v]) => Math.abs(v - value) >= minGap - 1e-9);

  for (const tier of tiers) {
    const items = tier
      .filter(([value]) => value >= min - 1e-9 && value <= max + 1e-9)
      .slice()
      .sort((a, b) => a[0] - b[0]);

    for (const item of items) {
      if (selected.some(([v]) => Math.abs(v - item[0]) < 1e-9)) {
        continue;
      }
      if (fits(item[0])) {
        selected.push(item);
      }
    }
  }

  selected.sort((a, b) => a[0] - b[0]);
  return Object.fromEntries(selected);
}

/**
 * Playback-rate marks: nice rates ≤ max (integers preferred, then *.5),
 * sparsified so labels do not crowd.
 */
export function playbackRateMarks(min: number, max: number): Record<number, string> {
  const format = (v: number) => `${Number(v.toFixed(1))}x`;
  // Wider relative gap on short ranges so labels do not sit on top of each other.
  const minGapFraction = max <= 1.5 ? 0.2 : 0.18;

  const integers: Array<readonly [number, string]> = [];
  for (let i = 1; i <= Math.floor(max + 1e-9); i += 1) {
    integers.push([i, format(i)]);
  }

  const halves: Array<readonly [number, string]> = [];
  for (let i = 0; ; i += 1) {
    const value = i + 0.5;
    if (value > max + 1e-9) {
      break;
    }
    halves.push([value, format(value)]);
  }

  // Prefer integers. Only use halves outside the integer span (or freely when
  // fewer than two integers) so 1.5 does not pack between 1x and 2x.
  const integerMarks = buildTieredSparseMarks(min, max, [integers], minGapFraction);
  const integerValues = Object.keys(integerMarks)
    .map(Number)
    .sort((a, b) => a - b);

  let halfCandidates = halves;
  if (integerValues.length >= 2) {
    const lo = integerValues[0]!;
    const hi = integerValues[integerValues.length - 1]!;
    halfCandidates = halves.filter(([value]) => value < lo - 1e-9 || value > hi + 1e-9);
  }

  const marks = buildTieredSparseMarks(min, max, [integers, halfCandidates], minGapFraction);

  if (Object.keys(marks).length === 0 && max >= min - 1e-9) {
    return { [max]: format(max) };
  }
  return marks;
}

/**
 * Volume marks for the media player: nice levels ≤ max (integers preferred,
 * then *.5), sparsified so labels do not crowd. Does not pin the raw max
 * (e.g. 2.3 → 200%, not 230%).
 */
export function volumeMarks(min: number, max: number): Record<number, string> {
  const format = (v: number) => `${Math.round(v * 100)}%`;
  const minGapFraction = max <= 1.5 ? 0.2 : 0.18;

  const integers: Array<readonly [number, string]> = [];
  for (let i = Math.ceil(min - 1e-9); i <= Math.floor(max + 1e-9); i += 1) {
    integers.push([i, format(i)]);
  }

  const halves: Array<readonly [number, string]> = [];
  for (let i = Math.floor(min); ; i += 1) {
    const value = i + 0.5;
    if (value > max + 1e-9) {
      break;
    }
    if (value >= min - 1e-9) {
      halves.push([value, format(value)]);
    }
  }

  // Prefer integers. Only use halves outside the integer span (or freely when
  // fewer than two integers) so 50% does not pack between 0% and 100%.
  const integerMarks = buildTieredSparseMarks(min, max, [integers], minGapFraction);
  const integerValues = Object.keys(integerMarks)
    .map(Number)
    .sort((a, b) => a - b);

  let halfCandidates = halves;
  if (integerValues.length >= 2) {
    const lo = integerValues[0]!;
    const hi = integerValues[integerValues.length - 1]!;
    halfCandidates = halves.filter(([value]) => value < lo - 1e-9 || value > hi + 1e-9);
  }

  const marks = buildTieredSparseMarks(min, max, [integers, halfCandidates], minGapFraction);

  if (Object.keys(marks).length === 0 && max >= min - 1e-9) {
    return { [max]: format(max) };
  }
  return marks;
}
