import { msg } from '@lit/localize';

import { getMedia } from '../../db/media.js';
import type { SubtitleSegment } from '../../types/models.js';
import {
  ALIGN_MAX_BYTES,
  ALIGN_MAX_DURATION_SEC,
  alignTooLargeMessage,
  alignTooLongMessage,
} from './constants.js';
import { canAlignWholeMedia } from './can-align-whole-media.js';
import { buildSubtitleSegmentsReferenceText } from './reference-text.js';
import {
  resolveSubtitleAlignWindow,
  subtitleAlignWindowDurationSec,
} from './subtitle-align-window.js';

export type WholeMediaAlignGateInput = {
  mediaId: string;
  subtitleSegments: ReadonlyArray<SubtitleSegment>;
  /** When omitted, blob size is not checked (preview may pass the loaded blob). */
  sourceBlob?: Blob | null;
};

/** Tooltip when「生成全部词条」is blocked; `null` when align-all is allowed. */
export async function resolveWholeMediaAlignBlockedTip(
  input: WholeMediaAlignGateInput,
): Promise<string | null> {
  const { mediaId, subtitleSegments, sourceBlob } = input;
  if (!mediaId) {
    return null;
  }
  try {
    const media = await getMedia(mediaId);
    if (!media) {
      return null;
    }
    const referenceText = buildSubtitleSegmentsReferenceText(subtitleSegments);
    if (subtitleSegments.length > 0) {
      const window = resolveSubtitleAlignWindow(subtitleSegments);
      const alignDurationSec = window ? subtitleAlignWindowDurationSec(window) : 0;
      if (
        !canAlignWholeMedia({
          alignDurationSec,
          referenceText,
        })
      ) {
        return alignDurationSec > ALIGN_MAX_DURATION_SEC
          ? alignTooLongMessage()
          : msg('需要对照原稿才能生成原音词条');
      }
    } else {
      const blobSizeBytes =
        sourceBlob && sourceBlob.size > 0 ? sourceBlob.size : media.size;
      if (media.duration > ALIGN_MAX_DURATION_SEC) {
        return alignTooLongMessage();
      }
      if (blobSizeBytes > ALIGN_MAX_BYTES) {
        return alignTooLargeMessage();
      }
    }
    return null;
  } catch {
    return null;
  }
}
