import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PracticeSession } from '../../types/models.js';
import { flushUpdates, mount } from '../../components/ui/test-utils.js';

const mockGetAllPracticeSessions = vi.fn();
const mockReportError = vi.fn().mockResolvedValue(undefined);

vi.mock('../../db/practice-session.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/practice-session.js')>();
  return {
    ...actual,
    getAllPracticeSessions: (...args: unknown[]) => mockGetAllPracticeSessions(...args),
  };
});

vi.mock('../../lib/error-reporter.js', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import './index.js';
import type { PracticeStatsPage } from './index.js';

function makeSession(overrides: Partial<PracticeSession> = {}): PracticeSession {
  const startedAt = overrides.startedAt ?? Date.parse('2026-07-10T10:00:00');
  return {
    id: 'sess-1',
    mediaId: 'media-1',
    mediaTitle: 'Song A',
    mediaType: 'audio',
    mediaFilename: 'Song A.mp3',
    mode: 'listening',
    startedAt,
    endedAt: startedAt + 120_000,
    activeMs: 120_000,
    dateKey: '2026-07-10',
    ...overrides,
  };
}

describe('practice-stats-page', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    mockGetAllPracticeSessions.mockReset();
    mockReportError.mockClear();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function waitForDashboard(el: PracticeStatsPage): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      await el.updateComplete;
      await flushUpdates();
      if (!el.shadowRoot?.textContent?.includes('加载中')) {
        return;
      }
    }
    throw new Error('practice-stats-page did not finish loading');
  }

  async function renderPage() {
    const result = mount(html`<practice-stats-page></practice-stats-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-stats-page') as PracticeStatsPage;
    await waitForDashboard(el);
    return el;
  }

  function getSegButtons(el: PracticeStatsPage, groupIndex: number): HTMLButtonElement[] {
    const groups = el.shadowRoot?.querySelectorAll('.seg') ?? [];
    return [...(groups[groupIndex]?.querySelectorAll('.seg-btn') ?? [])] as HTMLButtonElement[];
  }

  it('shows loading then empty dashboard when there are no sessions', async () => {
    let resolveSessions!: (value: PracticeSession[]) => void;
    mockGetAllPracticeSessions.mockReturnValue(
      new Promise((resolve) => {
        resolveSessions = resolve;
      }),
    );

    const result = mount(html`<practice-stats-page></practice-stats-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('practice-stats-page') as PracticeStatsPage;
    await el.updateComplete;

    expect(el.shadowRoot?.textContent).toContain('加载中');

    resolveSessions([]);
    await waitForDashboard(el);

    const text = el.shadowRoot?.textContent ?? '';
    expect(text).toContain('总时长');
    expect(text).toContain('该区间暂无练习数据');
    expect(text).toContain('0 秒');
  });

  it('renders populated dashboard with trend, breakdown, and ranking', async () => {
    mockGetAllPracticeSessions.mockResolvedValue([
      makeSession({
        id: 's1',
        activeMs: 60_000,
        mode: 'listening',
        dateKey: '2026-07-24',
        startedAt: Date.parse('2026-07-24T10:00:00'),
        endedAt: Date.parse('2026-07-24T10:01:00'),
      }),
      makeSession({
        id: 's2',
        mediaId: 'media-2',
        mediaTitle: 'Video B',
        mediaType: 'video',
        mode: 'echo',
        activeMs: 90_000,
        dateKey: '2026-07-25',
        startedAt: Date.parse('2026-07-25T12:00:00'),
        endedAt: Date.parse('2026-07-25T12:01:30'),
      }),
    ]);
    const el = await renderPage();
    const text = el.shadowRoot?.textContent ?? '';

    expect(text).toContain('2 分 30 秒');
    expect(text).toContain('会话数');
    expect(text).toContain('练习趋势');
    expect(text).toContain('模式构成');
    expect(text).toContain('练习最多的材料');
    expect(text).toContain('Video B');
    expect(el.shadowRoot?.querySelector('.stack-bar')).not.toBeNull();
  });

  it('falls back to empty stats and reports when load fails', async () => {
    mockGetAllPracticeSessions.mockRejectedValue(new Error('db unavailable'));
    const el = await renderPage();

    expect(mockReportError).toHaveBeenCalled();
    expect(el.shadowRoot?.textContent).toContain('该区间暂无练习数据');
  });

  it('reloads when date preset and mode filters change', async () => {
    mockGetAllPracticeSessions.mockResolvedValue([makeSession()]);
    const el = await renderPage();
    expect(mockGetAllPracticeSessions).toHaveBeenCalledTimes(1);

    getSegButtons(el, 0)[0]?.click();
    await waitForDashboard(el);
    expect(mockGetAllPracticeSessions).toHaveBeenCalledTimes(2);

    getSegButtons(el, 1)[2]?.click();
    await waitForDashboard(el);
    expect(mockGetAllPracticeSessions).toHaveBeenCalledTimes(3);
  });

  it('shows custom date inputs and navigates from ranking', async () => {
    mockGetAllPracticeSessions.mockResolvedValue([
      makeSession({
        mediaTitle: 'Ranked Track',
        activeMs: 180_000,
        dateKey: '2026-07-25',
        startedAt: Date.parse('2026-07-25T09:00:00'),
        endedAt: Date.parse('2026-07-25T09:03:00'),
      }),
    ]);
    const el = await renderPage();

    getSegButtons(el, 0)[3]?.click();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelectorAll('.custom-range ui-input').length).toBe(2);

    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);
    el.shadowRoot
      ?.querySelector('.rank-title')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(navigateSpy).toHaveBeenCalledWith('/practice?mediaId=media-1');
  });
});
