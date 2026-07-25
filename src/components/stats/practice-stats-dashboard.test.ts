import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAllPracticeSessions = vi.fn().mockResolvedValue([]);

vi.mock('../../db/practice-session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/practice-session.js')>();
  return {
    ...actual,
    getAllPracticeSessions: (...args: unknown[]) => mockGetAllPracticeSessions(...args),
  };
});

vi.mock('../../lib/error-reporter.js', () => ({
  reportError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../i18n/localization.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../i18n/localization.js')>();
  return {
    ...actual,
    getLocale: vi.fn(() => 'zh-CN'),
    changeLocale: vi.fn().mockResolvedValue(undefined),
  };
});

import './practice-stats-dashboard.js';
import type { PracticeStatsDashboard } from './practice-stats-dashboard.js';
import type { HomeDashboardData } from '../../analytics/practice-stats-aggregate.js';
import { mount } from '../ui/test-utils.js';

describe('practice-stats-dashboard', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    mockGetAllPracticeSessions.mockReset();
    mockGetAllPracticeSessions.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('renders today totals and continue action from injected data', async () => {
    const data: HomeDashboardData = {
      todayMs: 100_000,
      byMode: { listening: 60_000, discrimination: 0, shadowing: 0, echo: 40_000 },
      lastSession: {
        id: 's1',
        mediaId: 'm2',
        mediaTitle: 'Latest Track',
        mediaType: 'audio',
        mediaFilename: 'Latest Track.mp3',
        playlistId: 'pl-9',
        mode: 'echo',
        startedAt: 1,
        endedAt: 2,
        activeMs: 40_000,
        dateKey: '2026-07-12',
      },
      streakDays: 3,
    };

    const result = mount(html`<practice-stats-dashboard .data=${data}></practice-stats-dashboard>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-stats-dashboard') as PracticeStatsDashboard;
    await el.updateComplete;

    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('Latest Track');
    expect(el.shadowRoot?.querySelector('ui-button')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-icon')?.getAttribute('name')).toBe('music');

    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);
    el.shadowRoot?.querySelector('ui-button')?.dispatchEvent(new Event('click'));
    expect(navigateSpy).toHaveBeenCalledWith('/practice?mediaId=m2&playlistId=pl-9');
  });

  it('continues single media without playlistId', async () => {
    const data: HomeDashboardData = {
      todayMs: 10_000,
      byMode: { listening: 10_000, discrimination: 0, shadowing: 0, echo: 0 },
      lastSession: {
        id: 's2',
        mediaId: 'm1',
        mediaTitle: 'Solo',
        mediaType: 'video',
        mediaFilename: 'Solo.mp4',
        mode: 'listening',
        startedAt: 1,
        endedAt: 2,
        activeMs: 10_000,
        dateKey: '2026-07-12',
      },
      streakDays: 0,
    };

    const result = mount(html`<practice-stats-dashboard .data=${data}></practice-stats-dashboard>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-stats-dashboard') as PracticeStatsDashboard;
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('ui-icon')?.getAttribute('name')).toBe('video');
    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);
    el.shadowRoot?.querySelector('ui-button')?.dispatchEvent(new Event('click'));
    expect(navigateSpy).toHaveBeenCalledWith('/practice?mediaId=m1');
  });

  it('loads sessions automatically and shows empty state', async () => {
    const result = mount(html`<practice-stats-dashboard></practice-stats-dashboard>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-stats-dashboard') as PracticeStatsDashboard;
    await el.updateComplete;
    await el.refresh();
    await el.updateComplete;
    expect(el.shadowRoot?.textContent).toContain('今天还没有练习记录');
  });

  it('navigates to stats from view-all link', async () => {
    const data: HomeDashboardData = {
      todayMs: 5_000,
      byMode: { listening: 5_000, discrimination: 0, shadowing: 0, echo: 0 },
      lastSession: null,
      streakDays: 1,
    };
    const result = mount(html`<practice-stats-dashboard .data=${data}></practice-stats-dashboard>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-stats-dashboard') as PracticeStatsDashboard;
    await el.updateComplete;

    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);
    el.shadowRoot?.querySelector('.link-btn')?.dispatchEvent(new Event('click'));
    expect(navigateSpy).toHaveBeenCalledWith('/stats');
  });

  it('hides view-all link when showViewAll is false', async () => {
    const data: HomeDashboardData = {
      todayMs: 5_000,
      byMode: { listening: 5_000, discrimination: 0, shadowing: 0, echo: 0 },
      lastSession: null,
      streakDays: 0,
    };
    const result = mount(
      html`<practice-stats-dashboard
        .data=${data}
        .showViewAll=${false}
      ></practice-stats-dashboard>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-stats-dashboard') as PracticeStatsDashboard;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.link-btn')).toBeNull();
  });

  it('dispatches continue-practice before navigating', async () => {
    const data: HomeDashboardData = {
      todayMs: 10_000,
      byMode: { listening: 10_000, discrimination: 0, shadowing: 0, echo: 0 },
      lastSession: {
        id: 's1',
        mediaId: 'm1',
        mediaTitle: 'Track',
        mediaType: 'audio',
        mediaFilename: 'Track.mp3',
        mode: 'listening',
        startedAt: 1,
        endedAt: 2,
        activeMs: 10_000,
        dateKey: '2026-07-12',
      },
      streakDays: 0,
    };
    const result = mount(html`<practice-stats-dashboard .data=${data}></practice-stats-dashboard>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-stats-dashboard') as PracticeStatsDashboard;
    await el.updateComplete;

    const handler = vi.fn();
    el.addEventListener('continue-practice', handler);
    vi.spyOn(el, 'navigate').mockImplementation(() => undefined);
    el.shadowRoot?.querySelector('ui-button')?.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalled();
  });

  it('falls back to empty dashboard when session load fails', async () => {
    mockGetAllPracticeSessions.mockRejectedValueOnce(new Error('db down'));
    const result = mount(html`<practice-stats-dashboard></practice-stats-dashboard>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-stats-dashboard') as PracticeStatsDashboard;
    await el.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
    expect(el.shadowRoot?.textContent).toContain('今天还没有练习记录');
  });
});
