import { deleteMediaSourceWordAlignment } from '../../db/media-source-word-alignment.js';
import { deleteBatchSourceWordAlignmentsByMediaId } from '../../db/source-word-alignment.js';

/** Drop Media canonical + batch segment rows; keep per-segment overrides. */
export async function invalidateAlignCachesOnSubtitleChange(mediaId: string): Promise<void> {
  await deleteMediaSourceWordAlignment(mediaId);
  await deleteBatchSourceWordAlignmentsByMediaId(mediaId);
}
