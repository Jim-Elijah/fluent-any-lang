import type { PauseMode, SubtitleSegment } from '../types/models.js';
import { getLocale } from '../i18n/localization.js';

export const MAX_SLEEP_MINUTES = 90;

export enum MediaEventType {
  LOADSTART = 'loadstart', // 客户端开始请求数据
  PROGRESS = 'progress', // 客户端正在请求/加载媒体数据
  SUSPEND = 'suspend', // 媒体数据加载被挂起/暂停
  ABORT = 'abort', // 客户端主动终止下载（非错误引起）
  ERROR = 'error', // 在获取媒体数据过程中发生错误
  EMPTIED = 'emptied', // 媒体变为空（例如，已加载但调用了 .load() 重新加载）
  STALLED = 'stalled', // 尝试获取媒体数据，但数据意外不可用
  LOADEDMETADATA = 'loadedmetadata', // 媒体的元数据（时长、尺寸等）已加载完成
  LOADEDDATA = 'loadeddata', // 媒体的第一帧已加载完成
  CANPLAY = 'canplay', // 浏览器可以开始播放媒体，但估计不足以无缓冲播放完毕
  CANPLAYTHROUGH = 'canplaythrough', // 浏览器估计可以顺利播放到底，无需再次缓冲停顿
  PLAYING = 'playing', // 播放已开始（在暂停或因缺乏数据延迟后准备就绪）
  WAITING = 'waiting', // 播放由于暂时缺乏数据而停止/等待
  PLAY = 'play', // 播放已开始（调用了 play() 方法或设置了 autoplay）
  PAUSE = 'pause', // 播放已暂停
  SEEKING = 'seeking', // 正在进行定位/跳转操作（开始）
  SEEKED = 'seeked', // 定位/跳转操作已完成
  TIMEUPDATE = 'timeupdate', // currentTime 属性指示的时间已更新
  ENDED = 'ended', // 播放到达媒体结束位置，停止播放
  RATECHANGE = 'ratechange', // 播放速率发生改变
  DURATIONCHANGE = 'durationchange', // duration 属性（媒体总时长）被更新
  VOLUMECHANGE = 'volumechange', // 音量发生改变（静音设置也触发此事件）
  ENCRYPTED = 'encrypted', // 加密媒体初始化（通常用于受版权保护的内容，如DRM）
}

/**
 * 从 HTMLMediaElement 转发给外部监听者的原生事件列表。
 */
export const NATIVE_MEDIA_EVENTS = Object.values(MediaEventType);

export enum ExtendedMediaEventType {
  SEGMENT_CHANGE = 'segment-change', // 当前播放句改变
  SEGMENT_END = 'segment-end', // 当前播放句结束
  TRACK_CHANGE = 'track-change', // 当前播放媒体改变
}

/**
 * 从 MediaController 转发给外部监听者的自定义事件列表。
 */
export const EXPANDED_MEDIA_EVENTS = Object.values(ExtendedMediaEventType);

/**
 * 从 HTMLMediaElement 转发给外部监听者的事件列表。
 * MediaController 会将这些事件重新包装为 CustomEvent 并向上 dispatch。
 */

export const FORWARDED_MEDIA_EVENTS = [...NATIVE_MEDIA_EVENTS, ...EXPANDED_MEDIA_EVENTS] as const;

export function formatStorageUsage(usage: number): string {
  return (usage / 1024 / 1024).toFixed(1) + ' MB';
}

/**
 * 格式化日期时间
 * @param timestamp - 时间戳
 * @param useLocal - 是否使用本地时间
 * @returns 格式化后的日期时间
 */
export function formatDate(timestamp: number, useLocal: boolean): string {
  const date = new Date(timestamp);
  if (!useLocal) {
    return formatExportDate(date);
  }
  return formatDisplayDate(date);
}

function formatExportDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function formatDisplayDate(date: Date): string {
  const locale = getLocale();
  // 英文用 12 小时制更符合习惯，其他 locale 用 24 小时
  const hour12 = locale === 'en';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12,
  }).format(date);
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

/**
 * Finds the rightmost segment whose end boundary was crossed between two playback times.
 * Returns -1 when no segment end was crossed (including seek backward or empty segments).
 */
export function findCrossedSegmentEnd(
  segments: SubtitleSegment[],
  previousTime: number,
  currentTime: number,
  epsilon = 0.05,
): number {
  if (segments.length === 0 || currentTime <= previousTime) {
    return -1;
  }

  let crossedIndex = -1;

  for (let index = 0; index < segments.length; index++) {
    const threshold = segments[index].endTime - epsilon;
    if (previousTime < threshold && currentTime >= threshold) {
      crossedIndex = index;
    }
  }

  return crossedIndex;
}

/** Pause duration in milliseconds for inter-segment pause; null when pause mode is off. */
export function computeSegmentPauseMs(
  segment: SubtitleSegment,
  pauseMode: PauseMode,
  pauseSeconds: number,
  pausePercent: number,
): number | null {
  if (pauseMode === 'off') {
    return null;
  }

  if (pauseMode === 'seconds') {
    return pauseSeconds * 1000;
  }

  return (((segment.endTime - segment.startTime) * pausePercent) / 100) * 1000;
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
