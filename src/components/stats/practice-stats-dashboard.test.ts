import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
});
