import { getDB } from './index.js';
import {
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_RECORDING_BLOB,
  STORE_RECORDING,
  STORE_SUBTITLE,
} from './schema.js';
import type {
  MediaBlob,
  MediaItem,
  PracticeRecordBlob,
  PracticeRecord,
  SubtitleTrack,
} from '../types/models.js';

export async function listMedia(): Promise<MediaItem[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_MEDIA, 'byCreatedAt');
  return items.reverse();
}

export async function getMedia(id: string): Promise<MediaItem | undefined> {
  const db = await getDB();
  return db.get(STORE_MEDIA, id);
}

export async function getMediasByTitle(title: string): Promise<Array<MediaItem | undefined>> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_MEDIA, 'byTitle', title);
}

export async function updateMedia(media: MediaItem) {
  const db = await getDB();
  return db.put(STORE_MEDIA, media);
}

export async function getMediaBlob(mediaId: string): Promise<Blob | undefined> {
  const db = await getDB();
  const record = await db.get(STORE_MEDIA_BLOB, mediaId);
  return record?.blob;
}

export async function getSubtitle(mediaTitle: string): Promise<SubtitleTrack | undefined> {
  const db = await getDB();
  return db.getFromIndex(STORE_SUBTITLE, 'byTitle', mediaTitle);
}

/** @TODO 将media和subtitle的保存分离 */
export async function saveMedia(
  item?: MediaItem,
  blob?: Blob,
  subtitles?: SubtitleTrack,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_MEDIA, STORE_MEDIA_BLOB, STORE_SUBTITLE], 'readwrite');

  if (item) {
    await tx.objectStore(STORE_MEDIA).put(item);
  }
  if (item && blob) {
    const mediaBlob: MediaBlob = { mediaId: item.id, blob };
    await tx.objectStore(STORE_MEDIA_BLOB).put(mediaBlob);
  }
  if (subtitles) {
    await tx.objectStore(STORE_SUBTITLE).put(subtitles);
  }

  await tx.done;
}

/** @fixme 删除资源，1. 对应的recordBlob没有删除 2.录音库没有刷新 */
export async function deleteMedia(id: string, title: string): Promise<void> {
  const db = await getDB();
  const recordings = await db.getAllFromIndex(STORE_RECORDING, 'byMediaId', id);
  const subtitle = await getSubtitle(title);
  console.log('deleteMedia', id, recordings, subtitle);
  const tx = db.transaction(
    [STORE_MEDIA, STORE_MEDIA_BLOB, STORE_SUBTITLE, STORE_RECORDING],
    'readwrite',
  );

  await tx.objectStore(STORE_MEDIA).delete(id);
  await tx.objectStore(STORE_MEDIA_BLOB).delete(id);

  // await tx.objectStore(STORE_SUBTITLE).delete(id);
  if (subtitle) {
    await tx.objectStore(STORE_SUBTITLE).delete(subtitle.id);
  }

  for (const recording of recordings) {
    await tx.objectStore(STORE_RECORDING).delete(recording.id);
  }

  await tx.done;
}

export async function countMedia(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_MEDIA);
}

export async function listAllRecordings(): Promise<PracticeRecord[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_RECORDING, 'byCreatedAt');
  return items.reverse();
}

export async function listRecordings(mediaId: string): Promise<PracticeRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_RECORDING, 'byMediaId', mediaId);
}

export async function countRecordings(mediaId: string): Promise<number> {
  const db = await getDB();
  return db.countFromIndex(STORE_RECORDING, 'byMediaId', mediaId);
}

export async function saveRecording(record: PracticeRecord, blob: Blob): Promise<void> {
  const db = await getDB();
  const recordBlob: PracticeRecordBlob = {
    recordId: record.id,
    blob,
  };

  console.log('saveRecording', record, blob);

  const tx = db.transaction([STORE_RECORDING, STORE_RECORDING_BLOB], 'readwrite');

  await tx.objectStore(STORE_RECORDING).put(record);
  await tx.objectStore(STORE_RECORDING_BLOB).put(recordBlob);

  await tx.done;
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_RECORDING, STORE_RECORDING_BLOB], 'readwrite');

  await tx.objectStore(STORE_RECORDING).delete(id);
  await tx.objectStore(STORE_RECORDING_BLOB).delete(id);

  await tx.done;
}

export async function getRecordingBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  const record = await db.get(STORE_RECORDING_BLOB, id);
  return record?.blob;
}
