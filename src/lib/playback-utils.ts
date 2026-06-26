import type { SubtitleSegment } from '../types/models.js';

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export const MAX_SLEEP_MINUTES = 90;

export function formatStorageUsage(usage: number): string {
  return (usage / 1024 / 1024).toFixed(1) + ' MB';
}

export function formatDate(timestamp: number, useLocal: boolean): string {
  if (useLocal) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));
  }
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  return `${parts[4].value}-${parts[0].value}-${parts[2].value} ${parts[6].value}:${parts[8].value}`;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function findSegmentIndex(segments: SubtitleSegment[], time: number): number {
  const len = segments.length;
  if (len === 0) {
    return -1;
  }

  // Binary search: find the rightmost segment whose startTime <= time
  let low = 0;
  let high = len - 1;
  let candidate = -1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (segments[mid].startTime <= time) {
      candidate = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // time is before the first segment
  if (candidate < 0) {
    return -1;
  }

  const seg = segments[candidate];
  const isLast = candidate === len - 1;

  // Within the segment's time range
  // 采用左闭右开  [startTime, endTime)
  // 当time=endTime时，归于下个segment，这适用于中间的segment
  // 但最后一个segment, time=endTime时归于本segment
  if (time < seg.endTime || (isLast && time <= seg.endTime)) {
    return candidate;
  }

  // After all subtitles have ended
  if (isLast) {
    return -1;
  }

  // In a gap between segments — keep previous segment active to avoid flicker
  return candidate;
}

export function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, index) => index);

  for (let index = indices.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
  }

  return indices;
}
