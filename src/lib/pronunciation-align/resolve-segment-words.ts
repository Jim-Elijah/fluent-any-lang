import { getMediaSourceWordAlignment } from '../../db/media-source-word-alignment.js';
import { getSourceWordAlignment } from '../../db/source-word-alignment.js';
import type { PracticeSegment, SubtitleTrack } from '../../types/models.js';
import type { WordTiming } from '../../types/models.js';
import { projectWordsToSourceRange } from './project-words.js';

export type ResolveSegmentSourceWordsInput = {
  mediaId: string;
  segment: Pick<PracticeSegment, 'id' | 'sourceStartTime' | 'sourceEndTime'>;
  subtitleTrack?: Pick<SubtitleTrack, 'contentHash'>;
};

/**
 * Segment IDB row, else projection from a valid Media canonical row, else empty.
 */
export async function resolveSegmentSourceWords(
  input: ResolveSegmentSourceWordsInput,
): Promise<WordTiming[]> {
  const segmentRow = await getSourceWordAlignment(input.mediaId, input.segment.id);
  if (segmentRow) {
    return segmentRow.words;
  }

  const mediaRow = await getMediaSourceWordAlignment(input.mediaId);
  if (!mediaRow) {
    return [];
  }

  const liveHash = input.subtitleTrack?.contentHash;
  if (!liveHash || liveHash !== mediaRow.subtitleContentHash) {
    return [];
  }

  return projectWordsToSourceRange(
    mediaRow.words,
    input.segment.sourceStartTime,
    input.segment.sourceEndTime,
  );
}
