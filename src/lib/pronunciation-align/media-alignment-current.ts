import { getMediaSourceWordAlignment } from '../../db/media-source-word-alignment.js';
import { getSubtitle } from '../../db/subtitle.js';
import type { StoredMediaSourceWordAlignment, SubtitleTrack } from '../../types/models.js';

export function isMediaSourceWordAlignmentCurrent(
  row: StoredMediaSourceWordAlignment | undefined,
  track: SubtitleTrack | undefined,
): row is StoredMediaSourceWordAlignment {
  return Boolean(row && track && row.subtitleContentHash === track.contentHash);
}

/** Whether Media has whole-file WordTiming cache matching the current Subtitle Track. */
export async function hasCurrentMediaSourceWordAlignment(mediaId: string): Promise<boolean> {
  if (!mediaId) {
    return false;
  }
  const [row, track] = await Promise.all([
    getMediaSourceWordAlignment(mediaId),
    getSubtitle(mediaId),
  ]);
  return isMediaSourceWordAlignmentCurrent(row, track);
}
