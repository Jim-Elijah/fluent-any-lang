import { msg, str } from '@lit/localize';

import type { MediaType, PracticeAnalyticsMode, PracticeSession } from '../types/models.js';
import { toLocalDateKey } from '../db/practice-session.js';

export type StatsRangePreset = 'today' | 'last7' | 'month' | 'custom';
export type ModeFilter = 'all' | PracticeAnalyticsMode;
export type StatsBucketGranularity = 'day' | 'week' | 'month';

export const PRACTICE_MODES: readonly PracticeAnalyticsMode[] = [
  'listening',
  'discrimination',
  'shadowing',
  'echo',
] as const;

export type ModeBreakdown = Record<PracticeAnalyticsMode, number>;

export type DayBucket = {
  key: string;
  label: string;
  totalMs: number;
  byMode: ModeBreakdown;
};

export type MediaRankingItem = {
  mediaId: string;
  mediaTitle: string;
  mediaType: MediaType;
  mediaFilename: string;
  totalMs: number;
};

export type PracticeStatsSummary = {
  totalMs: number;
  sessionCount: number;
  activeDayCount: number;
  byMode: ModeBreakdown;
  buckets: DayBucket[];
  mediaRanking: MediaRankingItem[];
  granularity: StatsBucketGranularity;
};

export type HomeDashboardData = {
  todayMs: number;
  byMode: ModeBreakdown;
  lastSession: PracticeSession | null;
  streakDays: number;
};

export type DateRangeBounds = {
  fromMs: number;
  toMs: number;
  fromDateKey: string;
  toDateKey: string;
};

export function emptyModeBreakdown(): ModeBreakdown {
  return { listening: 0, discrimination: 0, shadowing: 0, echo: 0 };
}

/** 将有效练习毫秒格式化为可读时长 */
export function formatActiveDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) {
    return msg(str`${totalSec} 秒`);
  }
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    const sec = totalSec % 60;
    return sec > 0 ? msg(str`${totalMin} 分 ${sec} 秒`) : msg(str`${totalMin} 分`);
  }
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min > 0 ? msg(str`${hours} 时 ${min} 分`) : msg(str`${hours} 时`);
}

export function parseDateKey(dateKey: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateKey.split('-').map(Number);
  return { y, m, d };
}

/** dateKey 当天 00:00:00.000 本地时间 */
export function dateKeyToStartMs(dateKey: string): number {
  const { y, m, d } = parseDateKey(dateKey);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** dateKey 当天 23:59:59.999 本地时间 */
export function dateKeyToEndMs(dateKey: string): number {
  const { y, m, d } = parseDateKey(dateKey);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const { y, m, d } = parseDateKey(dateKey);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalDateKey(dt.getTime());
}

export function listDateKeysInclusive(fromDateKey: string, toDateKey: string): string[] {
  const keys: string[] = [];
  let cursor = fromDateKey;
  // 防御异常区间
  if (fromDateKey > toDateKey) {
    return keys;
  }
  while (cursor <= toDateKey) {
    keys.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return keys;
}

export function resolveRangeBounds(
  preset: StatsRangePreset,
  options: {
    now?: number;
    customFrom?: string;
    customTo?: string;
  } = {},
): DateRangeBounds {
  const now = options.now ?? Date.now();
  const todayKey = toLocalDateKey(now);

  if (preset === 'custom') {
    const fromDateKey = options.customFrom || todayKey;
    const toDateKey = options.customTo || todayKey;
    const ordered = fromDateKey <= toDateKey;
    const from = ordered ? fromDateKey : toDateKey;
    const to = ordered ? toDateKey : fromDateKey;
    return {
      fromDateKey: from,
      toDateKey: to,
      fromMs: dateKeyToStartMs(from),
      toMs: dateKeyToEndMs(to),
    };
  }

  if (preset === 'today') {
    return {
      fromDateKey: todayKey,
      toDateKey: todayKey,
      fromMs: dateKeyToStartMs(todayKey),
      toMs: dateKeyToEndMs(todayKey),
    };
  }

  if (preset === 'last7') {
    const fromDateKey = shiftDateKey(todayKey, -6);
    return {
      fromDateKey,
      toDateKey: todayKey,
      fromMs: dateKeyToStartMs(fromDateKey),
      toMs: dateKeyToEndMs(todayKey),
    };
  }

  // month: 本月 1 日 → 今天
  const { y, m } = parseDateKey(todayKey);
  const fromDateKey = `${y}-${String(m).padStart(2, '0')}-01`;
  return {
    fromDateKey,
    toDateKey: todayKey,
    fromMs: dateKeyToStartMs(fromDateKey),
    toMs: dateKeyToEndMs(todayKey),
  };
}

export function chooseGranularity(fromDateKey: string, toDateKey: string): StatsBucketGranularity {
  const days = listDateKeysInclusive(fromDateKey, toDateKey).length;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

function weekBucketKey(dateKey: string): string {
  const { y, m, d } = parseDateKey(dateKey);
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(y, m - 1, d + mondayOffset);
  return toLocalDateKey(monday.getTime());
}

function monthBucketKey(dateKey: string): string {
  return dateKey.slice(0, 7); // YYYY-MM
}

function bucketKeyFor(dateKey: string, granularity: StatsBucketGranularity): string {
  if (granularity === 'week') return weekBucketKey(dateKey);
  if (granularity === 'month') return monthBucketKey(dateKey);
  return dateKey;
}

function shortDayLabel(dateKey: string): string {
  const { m, d } = parseDateKey(dateKey);
  return `${m}/${d}`;
}

function bucketLabel(key: string, granularity: StatsBucketGranularity): string {
  if (granularity === 'day') return shortDayLabel(key);
  if (granularity === 'week') return shortDayLabel(key);
  // month
  const [y, m] = key.split('-');
  return `${y}/${Number(m)}`;
}

export function filterSessions(
  sessions: PracticeSession[],
  bounds: DateRangeBounds,
  mode: ModeFilter = 'all',
): PracticeSession[] {
  return sessions.filter((s) => {
    if (s.startedAt < bounds.fromMs || s.startedAt > bounds.toMs) return false;
    if (mode !== 'all' && s.mode !== mode) return false;
    return true;
  });
}

export function aggregatePracticeStats(
  sessions: PracticeSession[],
  options: {
    preset?: StatsRangePreset;
    mode?: ModeFilter;
    now?: number;
    customFrom?: string;
    customTo?: string;
    mediaRankingLimit?: number;
  } = {},
): PracticeStatsSummary {
  const preset = options.preset ?? 'last7';
  const mode = options.mode ?? 'all';
  const bounds = resolveRangeBounds(preset, {
    now: options.now,
    customFrom: options.customFrom,
    customTo: options.customTo,
  });
  const filtered = filterSessions(sessions, bounds, mode);
  const granularity = chooseGranularity(bounds.fromDateKey, bounds.toDateKey);

  const byMode = emptyModeBreakdown();
  const activeDays = new Set<string>();
  const mediaMap = new Map<string, MediaRankingItem>();
  const bucketMap = new Map<string, DayBucket>();

  // 预填空桶，保证趋势图连续
  if (granularity === 'day') {
    for (const dateKey of listDateKeysInclusive(bounds.fromDateKey, bounds.toDateKey)) {
      bucketMap.set(dateKey, {
        key: dateKey,
        label: bucketLabel(dateKey, 'day'),
        totalMs: 0,
        byMode: emptyModeBreakdown(),
      });
    }
  }

  let totalMs = 0;
  for (const s of filtered) {
    totalMs += s.activeMs;
    byMode[s.mode] += s.activeMs;
    activeDays.add(s.dateKey);

    const bKey = bucketKeyFor(s.dateKey, granularity);
    let bucket = bucketMap.get(bKey);
    if (!bucket) {
      bucket = {
        key: bKey,
        label: bucketLabel(bKey, granularity),
        totalMs: 0,
        byMode: emptyModeBreakdown(),
      };
      bucketMap.set(bKey, bucket);
    }
    bucket.totalMs += s.activeMs;
    bucket.byMode[s.mode] += s.activeMs;

    const existing = mediaMap.get(s.mediaId);
    if (existing) {
      existing.totalMs += s.activeMs;
    } else {
      mediaMap.set(s.mediaId, {
        mediaId: s.mediaId,
        mediaTitle: s.mediaTitle || s.mediaId,
        mediaType: s.mediaType,
        mediaFilename: s.mediaFilename,
        totalMs: s.activeMs,
      });
    }
  }

  const buckets = [...bucketMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const limit = options.mediaRankingLimit ?? 8;
  const mediaRanking = [...mediaMap.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, limit);

  return {
    totalMs,
    sessionCount: filtered.length,
    activeDayCount: activeDays.size,
    byMode,
    buckets,
    mediaRanking,
    granularity,
  };
}

/**
 * 连续练习天数：从「今天」或「昨天」（若今天尚未练习）起，沿 dateKey 向前连续计数。
 */
export function computeStreakDays(
  dateKeys: Iterable<string>,
  todayKey: string = toLocalDateKey(),
): number {
  const set = new Set(dateKeys);
  let cursor = todayKey;
  if (!set.has(cursor)) {
    cursor = shiftDateKey(todayKey, -1);
    if (!set.has(cursor)) return 0;
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export function buildHomeDashboard(
  sessions: PracticeSession[],
  now: number = Date.now(),
): HomeDashboardData {
  const todayKey = toLocalDateKey(now);
  const byMode = emptyModeBreakdown();
  let todayMs = 0;
  let lastSession: PracticeSession | null = null;

  for (const s of sessions) {
    if (!lastSession || s.startedAt > lastSession.startedAt) {
      lastSession = s;
    }
    if (s.dateKey === todayKey) {
      todayMs += s.activeMs;
      byMode[s.mode] += s.activeMs;
    }
  }

  return {
    todayMs,
    byMode,
    lastSession,
    streakDays: computeStreakDays(
      sessions.map((s) => s.dateKey),
      todayKey,
    ),
  };
}
