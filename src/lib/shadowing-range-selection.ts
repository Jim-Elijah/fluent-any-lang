/** Shadowing Subtitle Segment range selection — pure logic, no DOM. */

export type ShadowingSegmentRange = { start: number; end: number };

export type ShadowingRangeState = {
  anchor: number | null;
  range: ShadowingSegmentRange | null;
  confirmed: boolean;
};

/**
 * Apply a segment click in range-selection mode.
 *
 * Rules:
 * - `confirmed === true` → ignore click (return original state)
 * - `anchor === null` → set anchor to clicked index
 * - otherwise → build range from `[min(anchor, index), max(anchor, index)]`, clear anchor
 */
export function applyShadowingRangeClick(
  state: ShadowingRangeState,
  index: number,
): ShadowingRangeState {
  if (state.confirmed) {
    return state;
  }
  if (state.anchor === null) {
    return { anchor: index, range: null, confirmed: false };
  }
  return {
    anchor: null,
    range: { start: Math.min(state.anchor, index), end: Math.max(state.anchor, index) },
    confirmed: true,
  };
}

/** Build a human-readable summary for the range bar. */
export function formatRangeSummary(state: ShadowingRangeState, segmentCount: number): string {
  if (state.range) {
    const count = state.range.end - state.range.start + 1;
    return `#${state.range.start + 1}–#${state.range.end + 1} · ${count}句`;
  }
  if (state.anchor !== null) {
    return `起点 #${state.anchor + 1} · 点终点`;
  }
  if (segmentCount > 0) {
    return '点起点和终点';
  }
  return '';
}
