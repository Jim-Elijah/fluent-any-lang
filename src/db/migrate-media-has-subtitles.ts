import type { MediaItem, SubtitleTrack } from '../types/models.js';
import type { AppDatabase } from './schema.js';
import { STORE_MEDIA, STORE_SUBTITLE } from './schema.js';

/**
 * Keep Media.hasSubtitles aligned with Subtitle Track presence (denormalized list cache).
 * Idempotent: no-op when every Media row already matches its Subtitle Track.
 */
export async function migrateMediaHasSubtitles(db: AppDatabase): Promise<void> {
  const [mediaItems, tracks] = await Promise.all([
    db.getAll(STORE_MEDIA) as Promise<MediaItem[]>,
    db.getAll(STORE_SUBTITLE) as Promise<SubtitleTrack[]>,
  ]);

  const hasByMediaId = new Map<string, boolean>();
  for (const track of tracks) {
    hasByMediaId.set(track.mediaId, track.segments.length > 0);
  }

  const toUpdate: MediaItem[] = [];
  for (const item of mediaItems) {
    const expected = hasByMediaId.get(item.id) ?? false;
    if (item.hasSubtitles !== expected) {
      toUpdate.push({ ...item, hasSubtitles: expected });
    }
  }

  if (toUpdate.length === 0) {
    return;
  }

  const tx = db.transaction(STORE_MEDIA, 'readwrite');
  for (const item of toUpdate) {
    await tx.store.put(item);
  }
  await tx.done;
}
