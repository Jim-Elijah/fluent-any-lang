/** Max samples shown for a live recording waveform (~15s at 50ms). */
export const LIVE_WAVEFORM_MAX_SAMPLES = 300;

/**
 * Floor for peak normalization so quiet mics still draw above the baseline,
 * without amplifying silence into a full-scale flat line.
 */
export const LIVE_WAVEFORM_MIN_CEILING = 0.05;

/**
 * Build display peaks for a live mic waveform: keep a trailing window and
 * normalize so quiet input remains visible on a short canvas.
 */
export function buildLiveDisplayPeaks(
  rawPeaks: ArrayLike<number>,
  options: { maxSamples?: number; minCeiling?: number } = {},
): Float32Array {
  const maxSamples = options.maxSamples ?? LIVE_WAVEFORM_MAX_SAMPLES;
  const minCeiling = options.minCeiling ?? LIVE_WAVEFORM_MIN_CEILING;
  const length = rawPeaks.length;
  if (length === 0) {
    return new Float32Array(0);
  }

  const start = Math.max(0, length - maxSamples);
  const count = length - start;
  let max = 0;
  for (let i = start; i < length; i++) {
    const value = rawPeaks[i] ?? 0;
    if (value > max) {
      max = value;
    }
  }

  const ceiling = Math.max(max, minCeiling);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = (rawPeaks[start + i] ?? 0) / ceiling;
  }
  return out;
}
