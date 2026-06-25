import { getDB } from './index.js';
import { STORE_MEDIA, STORE_MEDIA_BLOB } from './schema.js';
import type { MediaBlob, MediaItem } from '../types/models.js';

// create/insert
// add media and its blob
export async function addMedia(item: MediaItem, blob: MediaBlob): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_MEDIA, STORE_MEDIA_BLOB], 'readwrite');

  await tx.objectStore(STORE_MEDIA).put(item);
  await tx.objectStore(STORE_MEDIA_BLOB).put(blob);

  await tx.done;
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

export async function getMediaListByTitle(title: string): Promise<Array<MediaItem | undefined>> {
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
  console.log('updateMedia', media);
  return db.put(STORE_MEDIA, media);
}

// delete
// delete media and its blob
export async function deleteMedia(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_MEDIA, STORE_MEDIA_BLOB], 'readwrite');

  await tx.objectStore(STORE_MEDIA).delete(id);
  await tx.objectStore(STORE_MEDIA_BLOB).delete(id);

  await tx.done;
}
