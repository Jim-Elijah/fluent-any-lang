import { getDB } from './index.js';
import { STORE_MEDIA, STORE_MEDIA_BLOB, STORE_SUBTITLE } from './schema.js';
import type { MediaBlob, MediaItem } from '../types/models.js';
import { markMediaRemovedInAllPlaylistsBatch } from './playlist.js';
import { deleteReferenceProsodyProfilesByMediaIdsBatch } from './reference-prosody-profile.js';
import { deleteMediaSourceWordAlignmentsByMediaIdsBatch } from './media-source-word-alignment.js';
import { deleteSourceWordAlignmentsByMediaIdsBatch } from './source-word-alignment.js';
import {
  markSentenceBankSourceAvailable,
  markSentenceBankSourceUnavailableBatch,
} from './sentence-bank.js';

// create/insert
// add media and its blob
export async function addMedia(item: MediaItem, blob: MediaBlob): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_MEDIA, STORE_MEDIA_BLOB], 'readwrite');

  await tx.objectStore(STORE_MEDIA).put(item);
  await tx.objectStore(STORE_MEDIA_BLOB).put(blob);

  await tx.done;

  // Re-import of the same media id restores sentence-bank "view source" links.
  await markSentenceBankSourceAvailable(item.id);
}

// get/read
export async function getMediaList(): Promise<MediaItem[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_MEDIA, 'byCreatedAt');
  return items.reverse();
}

export async function getMedia(id: string): Promise<MediaItem | undefined> {
  const db = await getDB();
  return db.get(STORE_MEDIA, id);
}

export async function getMediaListByTitle(title: string): Promise<MediaItem[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_MEDIA, 'byTitle', title);
}

export async function getMediaBlob(mediaId: string): Promise<Blob | undefined> {
  const db = await getDB();
  const record = await db.get(STORE_MEDIA_BLOB, mediaId);
  return record?.blob;
}

export async function countMedia(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_MEDIA);
}

// update
// just update media metadata
export async function updateMedia(media: MediaItem) {
  const db = await getDB();
  return db.put(STORE_MEDIA, media);
}

// delete
// delete media and its blob
export async function deleteMediaBatch(ids: string[]): Promise<void> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const db = await getDB();
  const tx = db.transaction([STORE_MEDIA, STORE_MEDIA_BLOB, STORE_SUBTITLE], 'readwrite');
  const mediaStore = tx.objectStore(STORE_MEDIA);
  const blobStore = tx.objectStore(STORE_MEDIA_BLOB);
  const subtitleStore = tx.objectStore(STORE_SUBTITLE);
  const subtitleByMedia = subtitleStore.index('byMediaId');

  for (const id of uniqueIds) {
    await mediaStore.delete(id);
    await blobStore.delete(id);
    const subtitle = await subtitleByMedia.get(id);
    if (subtitle) {
      await subtitleStore.delete(subtitle.id);
    }
  }

  await tx.done;

  await markMediaRemovedInAllPlaylistsBatch(uniqueIds);
  await markSentenceBankSourceUnavailableBatch(uniqueIds);
  await deleteReferenceProsodyProfilesByMediaIdsBatch(uniqueIds);
  await deleteSourceWordAlignmentsByMediaIdsBatch(uniqueIds);
  await deleteMediaSourceWordAlignmentsByMediaIdsBatch(uniqueIds);
}

export async function deleteMedia(id: string): Promise<void> {
  await deleteMediaBatch([id]);
}
