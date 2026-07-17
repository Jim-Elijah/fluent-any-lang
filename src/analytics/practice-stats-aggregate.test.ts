import { describe, expect, it } from 'vitest';

import type { PracticeSession } from '../types/models.js';
import {
  aggregatePracticeStats,
  buildHomeDashboard,
  computeStreakDays,
  formatActiveDuration,
  listDateKeysInclusive,
  resolveRangeBounds,
  shiftDateKey,
} from './practice-stats-aggregate.js';

function makeSession(overrides: Partial<PracticeSession> = {}): PracticeSession {
  const startedAt = overrides.startedAt ?? Date.parse('2026-07-12T10:00:00');
  return {
    id: 'sess-1',
    mediaId: 'media-1',
    mediaTitle: 'Song A',
    mediaType: 'audio',
    mediaFilename: 'Song A.mp3',
    mode: 'listening',
    startedAt,
    endedAt: startedAt + 5_000,
    activeMs: 5_000,
    dateKey: '2026-07-12',
    ...overrides,
  };
}

describe('formatActiveDuration', () => {
  it('formats seconds, minutes, and hours', () => {
    expect(formatActiveDuration(0)).toBe('0 秒');
    expect(formatActiveDuration(45_000)).toBe('45 秒');
    expect(formatActiveDuration(90_000)).toBe('1 分 30 秒');
    expect(formatActiveDuration(3_600_000)).toBe('1 时');
    expect(formatActiveDuration(3_900_000)).toBe('1 时 5 分');
  });
});

describe('resolveRangeBounds', () => {
  const now = Date.parse('2026-07-12T15:00:00');

  it('resolves today / last7 / month', () => {
    expect(resolveRangeBounds('today', { now }).fromDateKey).toBe('2026-07-12');
    expect(resolveRangeBounds('last7', { now })).toMatchObject({
      fromDateKey: '2026-07-06',
      toDateKey: '2026-07-12',
    });
    expect(resolveRangeBounds('month', { now })).toMatchObject({
      fromDateKey: '2026-07-01',
      toDateKey: '2026-07-12',
    });
  });

  it('orders custom range', () => {
    expect(
      resolveRangeBounds('custom', {
        now,
        customFrom: '2026-07-10',
        customTo: '2026-07-08',
      }),
    ).toMatchObject({
      fromDateKey: '2026-07-08',
      toDateKey: '2026-07-10',
    });
  });
});

describe('listDateKeysInclusive / shiftDateKey', () => {
  it('lists inclusive keys', () => {
    expect(listDateKeysInclusive('2026-07-10', '2026-07-12')).toEqual([
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);
    expect(shiftDateKey('2026-07-01', -1)).toBe('2026-06-30');
  });
});

describe('aggregatePracticeStats', () => {
  const now = Date.parse('2026-07-12T18:00:00');

  const sessions = [
    makeSession({
      id: '1',
      mode: 'listening',
      activeMs: 60_000,
      dateKey: '2026-07-12',
      startedAt: Date.parse('2026-07-12T10:00:00'),
      mediaId: 'm1',
      mediaTitle: 'A',
    }),
    makeSession({
      id: '2',
      mode: 'shadowing',
      activeMs: 120_000,
      dateKey: '2026-07-12',
      startedAt: Date.parse('2026-07-12T11:00:00'),
      mediaId: 'm1',
      mediaTitle: 'A',
    }),
    makeSession({
      id: '3',
      mode: 'echo',
      activeMs: 30_000,
      dateKey: '2026-07-10',
      startedAt: Date.parse('2026-07-10T09:00:00'),
      mediaId: 'm2',
      mediaTitle: 'B',
    }),
    makeSession({
      id: '4',
      mode: 'listening',
      activeMs: 10_000,
      dateKey: '2026-07-01',
      startedAt: Date.parse('2026-07-01T09:00:00'),
      mediaId: 'm2',
      mediaTitle: 'B',
    }),
  ];

  it('aggregates last7 with day buckets and media ranking', () => {
    const summary = aggregatePracticeStats(sessions, { preset: 'last7', now });
    expect(summary.totalMs).toBe(210_000);
    expect(summary.sessionCount).toBe(3);
    expect(summary.activeDayCount).toBe(2);
    expect(summary.byMode).toEqual({
      listening: 60_000,
      shadowing: 120_000,
      echo: 30_000,
    });
    expect(summary.granularity).toBe('day');
    expect(summary.buckets).toHaveLength(7);
    expect(summary.buckets.find((b) => b.key === '2026-07-12')?.totalMs).toBe(180_000);
    expect(summary.mediaRanking[0]).toMatchObject({
      mediaId: 'm1',
      mediaTitle: 'A',
      mediaType: 'audio',
      mediaFilename: 'Song A.mp3',
      totalMs: 180_000,
    });
  });

  it('filters by mode', () => {
    const summary = aggregatePracticeStats(sessions, {
      preset: 'last7',
      now,
      mode: 'shadowing',
    });
    expect(summary.totalMs).toBe(120_000);
    expect(summary.sessionCount).toBe(1);
    expect(summary.byMode.shadowing).toBe(120_000);
    expect(summary.byMode.listening).toBe(0);
  });
});

describe('computeStreakDays', () => {
  it('counts from today when practiced today', () => {
    expect(computeStreakDays(['2026-07-12', '2026-07-11', '2026-07-10'], '2026-07-12')).toBe(3);
  });

  it('allows missing today if yesterday practiced', () => {
    expect(computeStreakDays(['2026-07-11', '2026-07-10'], '2026-07-12')).toBe(2);
  });

  it('returns 0 when gap > 1 day', () => {
    expect(computeStreakDays(['2026-07-09'], '2026-07-12')).toBe(0);
  });
});

describe('buildHomeDashboard', () => {
  it('builds today totals, last session, and streak', () => {
    const now = Date.parse('2026-07-12T18:00:00');
    const sessions = [
      makeSession({
        id: 'old',
        dateKey: '2026-07-11',
        startedAt: Date.parse('2026-07-11T10:00:00'),
        activeMs: 20_000,
        mediaId: 'm-old',
      }),
      makeSession({
        id: 'a',
        mode: 'listening',
        dateKey: '2026-07-12',
        startedAt: Date.parse('2026-07-12T10:00:00'),
        activeMs: 60_000,
        mediaId: 'm1',
      }),
      makeSession({
        id: 'b',
        mode: 'echo',
        dateKey: '2026-07-12',
        startedAt: Date.parse('2026-07-12T12:00:00'),
        activeMs: 40_000,
        mediaId: 'm2',
        mediaTitle: 'Latest',
      }),
    ];

    const dash = buildHomeDashboard(sessions, now);
    expect(dash.todayMs).toBe(100_000);
    expect(dash.byMode).toEqual({ listening: 60_000, shadowing: 0, echo: 40_000 });
    expect(dash.lastSession?.mediaId).toBe('m2');
    expect(dash.streakDays).toBe(2);
  });
});
