import { msg } from '@lit/localize';

import { getAppSettings } from './app-settings.js';
import { formatDate } from './playback-utils.js';
import type { PracticeRecord } from '../types/models.js';
import { getMedia, getRecordingBlob } from '../db/service.js';

export function formatRecordingFileName(recording: PracticeRecord, title?: string): string {
  const match = recording.mimeType.match(/\/([^;]+)/);
  const ext = match ? match[1] : 'webm';
  return `shadowing-${title ?? recording.mediaId}-${formatDate(recording.createdAt, false)}.${ext}`;
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
  const fileName = formatRecordingFileName(recording, mediaItem?.title);
  downloadBlob(blob, fileName);
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: 0, remaining: 0, remainingPercent: 100 };
  }

  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;
  let quota = estimate.quota ?? 0;
  console.log('quota', quota);
  const maxStorageMB = getAppSettings().maxStorageMB;
  quota = Math.min(maxStorageMB * 1024 * 1024, quota);
  const remaining = Math.max(quota - usage, 0);
  const remainingPercent = quota > 0 ? (remaining / quota) * 100 : 100;

  const res = { usage, quota, remaining, remainingPercent };
  console.log('estimateStorage', res);
  return res;
}
