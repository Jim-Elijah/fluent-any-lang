import { clipAudioBlob } from '../lib/audio-clip.js';
import { computeSentenceBankContentHash } from '../lib/segment-id.js';
import type {
  MediaItem,
  MediaType,
  SentenceBankBlob,
  SentenceBankEntry,
  SubtitleSegment,
} from '../types/models.js';
import { STORE_MEDIA } from './schema.js';
import { getMediaBlob } from './media.js';
import { getDB } from './index.js';
import { STORE_SENTENCE_BANK, STORE_SENTENCE_BANK_BLOB } from './schema.js';

export function isSentenceBankEntryActive(entry: SentenceBankEntry): boolean {
  return entry.removed !== true;
}

export async function getSentenceBankList(): Promise<SentenceBankEntry[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_SENTENCE_BANK, 'byCreatedAt');
  return items.filter(isSentenceBankEntryActive).reverse();
}

export async function getSentenceBankEntry(id: string): Promise<SentenceBankEntry | undefined> {
  const db = await getDB();
  return db.get(STORE_SENTENCE_BANK, id);
}

export async function getSentenceBankEntryByContentHash(
  contentHash: string,
): Promise<SentenceBankEntry | undefined> {
  const db = await getDB();
  return db.getFromIndex(STORE_SENTENCE_BANK, 'byContentHash', contentHash);
}

export async function getSentenceBankBlob(entryId: string): Promise<SentenceBankBlob | undefined> {
  const db = await getDB();
  return db.get(STORE_SENTENCE_BANK_BLOB, entryId);
}

export async function countSentenceBankEntries(): Promise<number> {
  const db = await getDB();
  const items = await db.getAll(STORE_SENTENCE_BANK);
  return items.filter(isSentenceBankEntryActive).length;
}

/** Soft-delete: mark removed, keep clipped audio for re-add. */
export async function deleteSentenceBankEntry(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_SENTENCE_BANK, id);
  if (!existing || existing.removed) {
    return;
  }
  await db.put(STORE_SENTENCE_BANK, { ...existing, removed: true });
}

export async function markSentenceBankSourceUnavailable(mediaId: string): Promise<void> {
  const db = await getDB();
  const entries = await db.getAllFromIndex(STORE_SENTENCE_BANK, 'bySourceMediaId', mediaId);
  if (entries.length === 0) {
    return;
  }

  const tx = db.transaction(STORE_SENTENCE_BANK, 'readwrite');
  const store = tx.objectStore(STORE_SENTENCE_BANK);
  for (const entry of entries) {
    if (entry.sourceAvailable) {
      await store.put({ ...entry, sourceAvailable: false });
    }
  }
  await tx.done;
}

export type AddToSentenceBankInput = {
  media: MediaItem;
  segment: SubtitleSegment;
};

export type AddToSentenceBankResult =
  | { status: 'added'; entry: SentenceBankEntry }
  | { status: 'duplicate'; entry: SentenceBankEntry };

export async function addToSentenceBank(
  input: AddToSentenceBankInput,
): Promise<AddToSentenceBankResult> {
  const { media, segment } = input;
  const contentHash = await computeSentenceBankContentHash(media.id, segment);
  const existing = await getSentenceBankEntryByContentHash(contentHash);
  if (existing) {
    if (!isSentenceBankEntryActive(existing)) {
      const revived: SentenceBankEntry = {
        ...existing,
        text: segment.text,
        ...(segment.translation ? { translation: segment.translation } : {}),
        sourceTitleSnapshot: media.title,
        sourceMediaType: media.type,
        sourceAvailable: true,
        removed: false,
      };
      const db = await getDB();
      await db.put(STORE_SENTENCE_BANK, revived);
      return { status: 'added', entry: revived };
    }
    return { status: 'duplicate', entry: existing };
  }

  const sourceBlob = await getMediaBlob(media.id);
  if (!sourceBlob) {
    throw new Error('Source media blob missing');
  }

  const clipped = await clipAudioBlob(sourceBlob, segment.startTime, segment.endTime);
  const entry: SentenceBankEntry = {
    id: crypto.randomUUID(),
    contentHash,
    text: segment.text,
    ...(segment.translation ? { translation: segment.translation } : {}),
    sourceMediaId: media.id,
    sourceSegmentId: segment.id,
    sourceStartTime: segment.startTime,
    sourceEndTime: segment.endTime,
    sourceTitleSnapshot: media.title,
    sourceMediaType: media.type,
    sourceAvailable: true,
    removed: false,
    createdAt: Date.now(),
  };

  const blobRecord: SentenceBankBlob = {
    entryId: entry.id,
    blob: clipped.blob,
    mimeType: clipped.mimeType,
    duration: clipped.duration,
  };

  const db = await getDB();
  const tx = db.transaction([STORE_SENTENCE_BANK, STORE_SENTENCE_BANK_BLOB], 'readwrite');
  await tx.objectStore(STORE_SENTENCE_BANK).put(entry);
  await tx.objectStore(STORE_SENTENCE_BANK_BLOB).put(blobRecord);
  await tx.done;

  return { status: 'added', entry };
}

export async function isSegmentInSentenceBank(
  mediaId: string,
  segment: SubtitleSegment,
): Promise<boolean> {
  const contentHash = await computeSentenceBankContentHash(mediaId, segment);
  const existing = await getSentenceBankEntryByContentHash(contentHash);
  return Boolean(existing && isSentenceBankEntryActive(existing));
}

export type RemoveFromSentenceBankResult =
  | { status: 'removed'; entry: SentenceBankEntry }
  | { status: 'missing' };

export async function removeFromSentenceBank(
  input: AddToSentenceBankInput,
): Promise<RemoveFromSentenceBankResult> {
  const { media, segment } = input;
  const contentHash = await computeSentenceBankContentHash(media.id, segment);
  const existing = await getSentenceBankEntryByContentHash(contentHash);
  if (!existing || !isSentenceBankEntryActive(existing)) {
    return { status: 'missing' };
  }
  await deleteSentenceBankEntry(existing.id);
  return { status: 'removed', entry: { ...existing, removed: true } };
}

export async function resolveSentenceBankSourceMediaType(
  entry: SentenceBankEntry,
): Promise<MediaType> {
  if (entry.sourceMediaType === 'audio' || entry.sourceMediaType === 'video') {
    return entry.sourceMediaType;
  }
  const db = await getDB();
  const media = await db.get(STORE_MEDIA, entry.sourceMediaId);
  return media?.type ?? 'audio';
}

export async function putSentenceBankEntry(
  entry: SentenceBankEntry,
  blobRecord: SentenceBankBlob,
): Promise<void> {
  const sourceMediaType = await resolveSentenceBankSourceMediaType(entry);
  const normalized: SentenceBankEntry = {
    ...entry,
    sourceMediaType,
    removed: entry.removed === true,
  };

  const db = await getDB();
  const tx = db.transaction([STORE_SENTENCE_BANK, STORE_SENTENCE_BANK_BLOB], 'readwrite');
  await tx.objectStore(STORE_SENTENCE_BANK).put(normalized);
  await tx.objectStore(STORE_SENTENCE_BANK_BLOB).put(blobRecord);
  await tx.done;
}
