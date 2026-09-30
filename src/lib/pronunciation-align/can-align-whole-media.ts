import { ALIGN_MAX_BYTES, ALIGN_MAX_DURATION_SEC } from './constants.js';

export function canAlignWholeMedia(input: {
  /** Effective span sent to `/align` (subtitle window), not full Media duration. */
  alignDurationSec: number;
  referenceText: string | null;
  /** When known (after clip), enforce size; omit for pre-clip eligibility only. */
  alignBlobSizeBytes?: number;
}): boolean {
  const reference = input.referenceText?.trim() ?? '';
  if (
    reference.length === 0 ||
    !(input.alignDurationSec > 0) ||
    input.alignDurationSec > ALIGN_MAX_DURATION_SEC
  ) {
    return false;
  }
  if (input.alignBlobSizeBytes !== undefined && input.alignBlobSizeBytes > ALIGN_MAX_BYTES) {
    return false;
  }
  return true;
}
