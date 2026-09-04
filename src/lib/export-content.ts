import { msg } from '@lit/localize';

import { getAppSettings } from './app-settings.js';
import { formatDate } from './playback-utils.js';
import type { PracticeRecord, SentenceBankEntry } from '../types/models.js';
import { getMedia, getRecordingBlob, getSentenceBankBlob } from '../db/service.js';

/** Short prefix of UUID/hash ids so export filenames stay readable. */
const ID_PREFIX_LEN = 8;

function extensionFromMimeType(mimeType: string): string {
  const match = mimeType.match(/\/([^;]+)/);
  return match ? match[1] : 'webm';
}

function shortId(id: string): string {
  return id.slice(0, ID_PREFIX_LEN);
}

/**
 * Pairable with Sentence Bank exports via short mediaId + segmentId.
 * Echo: `echo-{mediaId8}-{segmentId8}-{createdAt}.{ext}`
 * Shadowing: `shadowing-{title|mediaId8}-{createdAt}.{ext}` (original shape)
 */
export function formatRecordingFileName(recording: PracticeRecord, title?: string): string {
  const ext = extensionFromMimeType(recording.mimeType);
  const date = formatDate(recording.createdAt, false);
  if (recording.mode === 'echo' && recording.segmentId) {
    return `echo-${shortId(recording.mediaId)}-${shortId(recording.segmentId)}-${date}.${ext}`;
  }
  if (recording.mode === 'echo') {
    return `echo-${shortId(recording.mediaId)}-${date}.${ext}`;
  }
  return `shadowing-${title ?? shortId(recording.mediaId)}-${date}.${ext}`;
}

/**
 * Pairable with Echo recording exports via short sourceMediaId + sourceSegmentId.
 * `sentence-{mediaId8}-{segmentId8}-{createdAt}.{ext}`
 */
export function formatSentenceBankFileName(
  entry: Pick<SentenceBankEntry, 'sourceMediaId' | 'sourceSegmentId' | 'createdAt'>,
  mimeType: string,
): string {
  const ext = extensionFromMimeType(mimeType);
  const date = formatDate(entry.createdAt, false);
  return `sentence-${shortId(entry.sourceMediaId)}-${shortId(entry.sourceSegmentId)}-${date}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportRecording(recording: PracticeRecord): Promise<void> {
  const blob = await getRecordingBlob(recording.id);
  if (!blob) throw new Error(msg('录音文件未找到'));
  const mediaItem = await getMedia(recording.mediaId);
  downloadBlob(blob, formatRecordingFileName(recording, mediaItem?.title));
}

export async function exportSentenceBankEntry(entry: SentenceBankEntry): Promise<void> {
  const blobRecord = await getSentenceBankBlob(entry.id);
  if (!blobRecord) throw new Error(msg('句库音频未找到'));
  downloadBlob(blobRecord.blob, formatSentenceBankFileName(entry, blobRecord.mimeType));
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: 0, remaining: 0, remainingPercent: 100 };
  }

  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  let quota = estimate.quota ?? 0;
  const maxStorageMB = getAppSettings().maxStorageMB;
  quota = Math.min(maxStorageMB * 1024 * 1024, quota);
  const remaining = Math.max(quota - usage, 0);
  const remainingPercent = quota > 0 ? (remaining / quota) * 100 : 100;

  const res = { usage, quota, remaining, remainingPercent };
  return res;
}
