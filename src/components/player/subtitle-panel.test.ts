import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importSubtitleForMedia = vi.fn();

vi.mock('../../lib/import-content.js', () => ({
  importSubtitleForMedia: (...args: unknown[]) => importSubtitleForMedia(...args),
}));

vi.mock('../../db/media.js', () => ({
  getMediaBlob: vi.fn().mockResolvedValue(new Blob(['src'], { type: 'audio/mpeg' })),
}));

vi.mock('../../db/service.js', () => ({
  getRecordingBlob: vi.fn(),
}));

import { MediaController, type LoadedTrack } from '../../controllers/media-controller.js';
import {
  APP_SETTINGS_STORAGE_KEY,
  getAppSettings,
  setAppSettings,
} from '../../lib/app-settings.js';
import type { SubtitleSegment, SubtitleTrack } from '../../types/models.js';
import { flushUpdates, getPortalShadow, mount } from '../ui/test-utils.js';
import { Message } from '../ui/message.js';
import './subtitle-panel.js';
import type { SubtitlePanel } from './subtitle-panel.js';

function makeTrack(id: string, title: string, segments: SubtitleSegment[] = []): LoadedTrack {
  return {
    item: {
      id,
      title,
      filename: `${title}.mp3`,
      size: 100,
      type: 'audio',
      mimeType: 'audio/mpeg',
      duration: 30,
      createdAt: 1,
      hasSubtitles: segments.length > 0,
    },
    blob: new Blob(['audio'], { type: 'audio/mpeg' }),
    segments,
  };
}

describe('subtitle-panel', () => {
  let cleanup: (() => void) | undefined;
  let controller: MediaController;

  beforeEach(() => {
    importSubtitleForMedia.mockReset();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    controller.destroy();
    document.querySelector('[data-subtitle-fullscreen-portal]')?.remove();
  });

  async function renderPanel(
    options: {
      fullscreen?: boolean;
      defaultFullscreen?: boolean;
      showFullscreenIcon?: boolean;
      seekDisabled?: boolean;
      /** Product default is hidden; set true when exercising visible subtitle UI. */
      subtitlesVisible?: boolean;
    } = {},
  ) {
    controller = new MediaController();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 2, text: 'hello' },
      { id: 's2', startTime: 2, endTime: 4, text: 'world' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', segments)]);
    if (options.subtitlesVisible) {
      controller.setSubtitlesVisible(true);
    }

    const result = mount(html`
      <subtitle-panel
        .controller=${controller}
        .fullscreen=${options.fullscreen}
        ?default-fullscreen=${options.defaultFullscreen ?? false}
        .showFullscreenIcon=${options.showFullscreenIcon ?? true}
        .seekDisabled=${options.seekDisabled ?? false}
      ></subtitle-panel>
    `);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  it('renders subtitle panel shell', async () => {
    const el = await renderPanel();
    expect(el.shadowRoot?.querySelector('.surface')).not.toBeNull();
  });

  it('shows 1-based segment ordinals beside timestamps', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    const indices = [...(el.shadowRoot?.querySelectorAll('.segment-index') ?? [])].map(
      (node) => node.textContent,
    );
    expect(indices).toEqual(['#1', '#2']);
  });

  function clickShadowButtonByLabel(el: SubtitlePanel, keyword: string): void {
    const buttons = [...(el.shadowRoot?.querySelectorAll('ui-button') ?? [])];
    const button = buttons.find((item) =>
      (item.getAttribute('aria-label') ?? '').includes(keyword),
    );
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  }

  function segmentRows(el: SubtitlePanel): Element[] {
    return [...(el.shadowRoot?.querySelectorAll('.segment') ?? [])];
  }

  function maskButtonLabel(el: SubtitlePanel): string {
    const buttons = [...(el.shadowRoot?.querySelectorAll('ui-button') ?? [])];
    const button = buttons.find((item) => {
      const label = item.getAttribute('aria-label') ?? '';
      return (
        label.includes('遮罩非当前句') ||
        label.includes('遮罩全部') ||
        label.includes('关闭遮罩')
      );
    });
    return button?.getAttribute('aria-label') ?? '';
  }

  it('opens fullscreen portal in uncontrolled mode', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    expect(el.shadowRoot?.querySelectorAll('ui-button').length).toBeGreaterThan(1);
    clickShadowButtonByLabel(el, '全屏');
    await el.updateComplete;
    await flushUpdates();

    const portal = getPortalShadow('[data-subtitle-fullscreen-portal]');
    expect(portal?.querySelector('.list.fullscreen')).not.toBeNull();
    expect(portal?.querySelector('.list.fullscreen')?.textContent).toContain('hello');
  });

  it('closes fullscreen when close icon is clicked', async () => {
    const el = await renderPanel({ defaultFullscreen: true });
    const portal = getPortalShadow('[data-subtitle-fullscreen-portal]');
    expect(portal?.querySelector('.fullscreen-panel')).not.toBeNull();

    portal?.querySelector('ui-button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).toBeNull();
  });

  it('supports controlled fullscreen from parent', async () => {
    const el = await renderPanel({ fullscreen: false });

    el.fullscreen = true;
    await el.updateComplete;
    await flushUpdates();

    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).not.toBeNull();

    el.fullscreen = false;
    await el.updateComplete;
    await flushUpdates();

    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).toBeNull();
  });

  it('emits update:fullscreen when toggled in uncontrolled mode', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    const handler = vi.fn();
    el.addEventListener('update:fullscreen', handler);

    clickShadowButtonByLabel(el, '全屏');
    await el.updateComplete;
    await flushUpdates();

    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls.at(-1)?.[0].detail).toEqual({ fullscreen: true });
  });

  it('closes fullscreen on Escape', async () => {
    const el = await renderPanel({ defaultFullscreen: true });
    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).toBeNull();
    expect(el.fullscreen).toBeUndefined();
  });

  it('exits fullscreen when subtitles are hidden', async () => {
    const el = await renderPanel({ defaultFullscreen: true, subtitlesVisible: true });
    const handler = vi.fn();
    el.addEventListener('update:fullscreen', handler);

    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).not.toBeNull();

    clickShadowButtonByLabel(el, '隐藏字幕');
    await el.updateComplete;
    await flushUpdates();

    expect(controller.getSnapshot().subtitlesVisible).toBe(false);
    expect(
      getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector('.fullscreen-panel'),
    ).toBeNull();
    expect(handler.mock.calls.at(-1)?.[0].detail).toEqual({ fullscreen: false });
  });

  it('ignores translation toggle when subtitles are hidden', async () => {
    controller = new MediaController();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 2, text: 'hello', translation: '你好' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', segments)]);

    const result = mount(html`<subtitle-panel .controller=${controller}></subtitle-panel>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();

    controller.setSubtitlesVisible(true);
    await el.updateComplete;
    await flushUpdates();

    el.toggleTranslationVisible();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.translation.hidden')).toBeNull();

    controller.setSubtitlesVisible(false);
    await el.updateComplete;
    await flushUpdates();

    el.toggleTranslationVisible(); // must no-op while hidden
    await el.updateComplete;

    controller.setSubtitlesVisible(true);
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.querySelector('.translation.hidden')).toBeNull();
  });

  it('masks non-current source text while keeping the active segment readable', async () => {
    controller = new MediaController();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 2, text: 'hello' },
      { id: 's2', startTime: 2, endTime: 4, text: 'world' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', segments)]);
    controller.setSubtitlesVisible(true);
    controller.seekToSegment(0);

    const result = mount(html`<subtitle-panel .controller=${controller}></subtitle-panel>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();

    el.toggleSourceTextMask();
    await el.updateComplete;
    await flushUpdates();

    const rows = [...(el.shadowRoot?.querySelectorAll('.segment') ?? [])];
    expect(rows[0]?.querySelector('.text')?.textContent).toContain('hello');
    expect(rows[0]?.querySelector('.source-text-blurred')).toBeNull();
    expect(rows[1]?.querySelector('.source-text-blurred')).not.toBeNull();
    expect(rows[1]?.querySelector('.source-text-blurred')?.textContent).toBe('world');
  });

  it('keeps echo score badge visible when source text is masked', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.echoMode = true;
    el.echoLatestScoreBySegmentId = { s1: 84.2, s2: 70 };
    controller.seekToSegment(0);
    await el.updateComplete;
    await flushUpdates();

    el.toggleSourceTextMask();
    await el.updateComplete;
    await flushUpdates();

    const rows = [...(el.shadowRoot?.querySelectorAll('.segment') ?? [])];
    expect(rows[1]?.querySelector('.echo-score')).not.toBeNull();
    expect(rows[1]?.querySelector('.source-text-blurred')).not.toBeNull();
  });

  it('ignores source mask toggle when subtitles are hidden', async () => {
    controller = new MediaController();
    const segments: SubtitleSegment[] = [{ id: 's1', startTime: 0, endTime: 2, text: 'hello' }];
    await controller.loadTracks([makeTrack('a', 'Track A', segments)]);

    const result = mount(html`<subtitle-panel .controller=${controller}></subtitle-panel>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();

    controller.setSubtitlesVisible(true);
    await el.updateComplete;
    el.toggleSourceTextMask();
    await el.updateComplete;

    controller.setSubtitlesVisible(false);
    await el.updateComplete;
    el.toggleSourceTextMask();
    await el.updateComplete;

    controller.setSubtitlesVisible(true);
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.querySelector('.source-text-masked')).not.toBeNull();
  });

  it('cycles source mask from off to current line, then all, then off', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    controller.seekToSegment(0);
    await el.updateComplete;
    await flushUpdates();

    expect(maskButtonLabel(el)).toContain('遮罩非当前句');

    el.toggleSourceTextMask();
    await el.updateComplete;
    await flushUpdates();
    let rows = segmentRows(el);
    expect(rows[0]?.querySelector('.source-text-blurred')).toBeNull();
    expect(rows[1]?.querySelector('.source-text-blurred')).not.toBeNull();
    expect(maskButtonLabel(el)).toContain('遮罩全部');

    el.toggleSourceTextMask();
    await el.updateComplete;
    await flushUpdates();
    rows = segmentRows(el);
    expect(rows[0]?.querySelector('.source-text-blurred')).not.toBeNull();
    expect(rows[1]?.querySelector('.source-text-blurred')).not.toBeNull();
    expect(maskButtonLabel(el)).toContain('关闭遮罩');

    el.toggleSourceTextMask();
    await el.updateComplete;
    await flushUpdates();
    expect(el.shadowRoot?.querySelector('.source-text-blurred')).toBeNull();
    expect(maskButtonLabel(el)).toContain('遮罩非当前句');
  });

  it('blurs every source line in current mode when no segment is active', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.toggleSourceTextMask();
    controller.currentSegmentIndex = -1;
    controller.setNavigationLocked(true);
    await el.updateComplete;
    await flushUpdates();

    const rows = segmentRows(el);
    expect(rows[0]?.querySelector('.source-text-blurred')).not.toBeNull();
    expect(rows[1]?.querySelector('.source-text-blurred')).not.toBeNull();
    expect(maskButtonLabel(el)).toContain('遮罩全部');
  });

  it('starts from the saved source mask and keeps session cycles out of settings', async () => {
    localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
    setAppSettings({ sourceMaskMode: 'all' });
    try {
      const el = await renderPanel({ subtitlesVisible: true });
      const rows = segmentRows(el);
      expect(rows[0]?.querySelector('.source-text-blurred')).not.toBeNull();
      expect(rows[1]?.querySelector('.source-text-blurred')).not.toBeNull();

      el.toggleSourceTextMask();
      await el.updateComplete;
      await flushUpdates();

      expect(getAppSettings().sourceMaskMode).toBe('all');
      expect(el.shadowRoot?.querySelector('.source-text-blurred')).toBeNull();
    } finally {
      localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
    }
  });

  it('shows import subtitle CTA when media has no subtitles', async () => {
    controller = new MediaController();
    await controller.loadTracks([makeTrack('a', 'Track A', [])]);

    const result = mount(html`<subtitle-panel .controller=${controller}></subtitle-panel>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.textContent).toContain('当前媒体没有字幕');
    expect(el.shadowRoot?.textContent).toContain('导入字幕');
    expect(el.shadowRoot?.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('shows echo manage button disabled when segment has no recordings', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.echoMode = true;
    await el.updateComplete;
    await flushUpdates();

    const manageButton = el.shadowRoot?.querySelector('.row-actions ui-button.echo-manage') as
      | (HTMLElement & { disabled?: boolean })
      | null;
    expect(manageButton).not.toBeNull();
    expect(manageButton?.getAttribute('aria-label')).toBe('管理录音');
    expect(manageButton?.hasAttribute('disabled') || manageButton?.disabled).toBe(true);
  });

  it('colors echo score badges in the fullscreen subtitle list', async () => {
    const el = await renderPanel({ subtitlesVisible: true, defaultFullscreen: true });
    el.echoMode = true;
    el.echoLatestScoreBySegmentId = { s1: 84.2 };
    await el.updateComplete;
    await flushUpdates();

    const badge = getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector(
      '.echo-score',
    ) as HTMLElement | null;
    expect(badge?.textContent?.trim()).toBe('84');
    expect(badge?.classList.contains('score-band')).toBe(true);
    expect(badge?.classList.contains('good')).toBe(true);
    expect(getComputedStyle(badge!).color).toBe('#0958d9');
  });

  it('shows an overall badge inside segment text when a score is present', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.echoMode = true;
    el.echoLatestScoreBySegmentId = { s1: 84.2 };
    await el.updateComplete;
    await flushUpdates();

    const badge = el.shadowRoot?.querySelector('p.text:not(.translation) .echo-score');
    expect(badge?.textContent?.trim()).toBe('84');
    expect(el.shadowRoot?.querySelector('.row-actions .echo-score')).toBeNull();
  });

  it('requests echo manage recordings when manage button is clicked', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.echoMode = true;
    el.echoRecordingsBySegmentId = {
      s1: [
        {
          id: 'newest',
          mediaId: 'a',
          mediaTitle: 'Track A',
          mediaFilename: 'Track A.mp3',
          mode: 'echo',
          segmentId: 's1',
          mimeType: 'audio/webm',
          createdAt: 300,
          sourceDuration: 2,
          recordingDuration: 2,
          segments: [],
        },
        {
          id: 'oldest',
          mediaId: 'a',
          mediaTitle: 'Track A',
          mediaFilename: 'Track A.mp3',
          mode: 'echo',
          segmentId: 's1',
          mimeType: 'audio/webm',
          createdAt: 100,
          sourceDuration: 2,
          recordingDuration: 2,
          segments: [],
        },
        {
          id: 'middle',
          mediaId: 'a',
          mediaTitle: 'Track A',
          mediaFilename: 'Track A.mp3',
          mode: 'echo',
          segmentId: 's1',
          mimeType: 'audio/webm',
          createdAt: 200,
          sourceDuration: 2,
          recordingDuration: 2,
          segments: [],
        },
      ],
    };
    el.echoLimitPerSegment = 10;
    await el.updateComplete;
    await flushUpdates();

    const manageButton = el.shadowRoot?.querySelector('.row-actions ui-button.echo-manage') as
      | (HTMLElement & { disabled?: boolean })
      | null;
    expect(manageButton?.hasAttribute('disabled') || manageButton?.disabled).toBeFalsy();

    const managed = vi.fn();
    el.addEventListener('echo-manage-recordings', managed);
    manageButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(managed).toHaveBeenCalledWith(expect.objectContaining({ detail: { segmentId: 's1' } }));
  });

  it('shows echo manage button disabled when seekDisabled during session', async () => {
    const el = await renderPanel({ seekDisabled: true, subtitlesVisible: true });
    el.echoMode = true;
    el.echoRecordingsBySegmentId = {
      s1: [
        {
          id: 'rec1',
          mediaId: 'a',
          mediaTitle: 'Track A',
          mediaFilename: 'Track A.mp3',
          mode: 'echo',
          segmentId: 's1',
          mimeType: 'audio/webm',
          createdAt: 100,
          sourceDuration: 2,
          recordingDuration: 2,
          segments: [],
        },
      ],
    };
    await el.updateComplete;
    await flushUpdates();

    const manageButton = el.shadowRoot?.querySelector('.row-actions ui-button.echo-manage') as
      | (HTMLElement & { disabled?: boolean })
      | null;
    expect(manageButton).not.toBeNull();
    expect(manageButton?.hasAttribute('disabled') || manageButton?.disabled).toBe(true);
  });

  it('does not seek when seekDisabled and marks list as navigation-locked', async () => {
    const el = await renderPanel({ seekDisabled: true, subtitlesVisible: true });
    const seekSpy = vi.spyOn(controller, 'seekToSegment');

    expect(el.shadowRoot?.querySelector('ul.list')?.classList.contains('navigation-locked')).toBe(
      true,
    );

    const secondRow = el.shadowRoot?.querySelector(
      '[data-segment-index="1"]',
    ) as HTMLElement | null;
    secondRow?.click();
    await el.updateComplete;

    expect(seekSpy).not.toHaveBeenCalled();
  });

  it('seeks on segment click when seek is enabled', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    const seekSpy = vi.spyOn(controller, 'seekToSegment');

    expect(el.shadowRoot?.querySelector('ul.list')?.classList.contains('navigation-locked')).toBe(
      false,
    );

    const secondRow = el.shadowRoot?.querySelector(
      '[data-segment-index="1"]',
    ) as HTMLElement | null;
    secondRow?.click();
    await el.updateComplete;

    expect(seekSpy).toHaveBeenCalledWith(1);
  });

  it('toggles translation visibility when subtitles are shown', async () => {
    controller = new MediaController();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 2, text: 'hello', translation: '你好' },
      { id: 's2', startTime: 2, endTime: 4, text: 'world', translation: '世界' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', segments)]);
    controller.setSubtitlesVisible(true);

    const result = mount(html`<subtitle-panel .controller=${controller}></subtitle-panel>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.querySelectorAll('.translation')).toHaveLength(2);
    expect(el.shadowRoot?.querySelectorAll('.translation.hidden')).toHaveLength(2);

    el.toggleTranslationVisible();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelectorAll('.translation.hidden')).toHaveLength(0);

    el.toggleTranslationVisible();
    await el.updateComplete;
    expect(el.shadowRoot?.querySelectorAll('.translation.hidden')).toHaveLength(2);
  });

  it('shows hidden note when subtitles are toggled off', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    clickShadowButtonByLabel(el, '隐藏字幕');
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.textContent).toContain('字幕已隐藏');
  });

  it('dispatches sentence-bank-add when segment is not saved', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    const added = vi.fn();
    el.addEventListener('sentence-bank-add', added);

    const bankButton = el.shadowRoot?.querySelector(
      '.row-actions ui-button[aria-label="加入句库"]',
    ) as HTMLElement | null;
    bankButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;

    expect(added).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { segment: expect.objectContaining({ id: 's1' }) } }),
    );
  });

  it('dispatches sentence-bank-remove when segment is already saved', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.sentenceBankSegmentIds = ['s1'];
    await el.updateComplete;
    await flushUpdates();

    const removed = vi.fn();
    el.addEventListener('sentence-bank-remove', removed);

    const bankButton = el.shadowRoot?.querySelector(
      '.row-actions ui-button[aria-label="从句库移除"]',
    ) as HTMLElement | null;
    bankButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await el.updateComplete;

    expect(removed).toHaveBeenCalled();
  });

  it('ignores sentence bank toggle while busy', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.sentenceBankBusy = true;
    await el.updateComplete;

    const changed = vi.fn();
    el.addEventListener('sentence-bank-add', changed);

    const bankButton = el.shadowRoot?.querySelector('.row-actions ui-button') as HTMLElement | null;
    bankButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(changed).not.toHaveBeenCalled();
  });

  it('imports subtitle file from empty state', async () => {
    const track: SubtitleTrack = {
      id: 'sub-1',
      mediaId: 'a',
      title: 'Track A',
      filename: 'Track A.srt',
      type: 'srt',
      contentHash: 'hash',
      segments: [{ id: 's1', startTime: 0, endTime: 2, text: 'hello' }],
    };
    importSubtitleForMedia.mockResolvedValue({
      imported: [track],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });

    controller = new MediaController();
    await controller.loadTracks([makeTrack('a', 'Track A', [])]);
    const result = mount(html`<subtitle-panel .controller=${controller}></subtitle-panel>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();

    const imported = vi.fn();
    el.addEventListener('subtitle-imported', imported);
    const successSpy = vi.spyOn(Message, 'success');

    const input = el.shadowRoot!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['1'], 'Track A.srt', { type: 'application/x-subrip' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(importSubtitleForMedia).toHaveBeenCalled();
    expect(successSpy).toHaveBeenCalled();
    expect(imported).toHaveBeenCalled();
    expect(controller.getSnapshot().hasSubtitles).toBe(true);
  });

  it('shows update subtitle action only when media has subtitles', async () => {
    const el = await renderPanel();
    expect(el.shadowRoot?.querySelector('ui-button[aria-label="更新字幕"]')).not.toBeNull();

    controller = new MediaController();
    await controller.loadTracks([makeTrack('a', 'Track A', [])]);
    const result = mount(html`<subtitle-panel .controller=${controller}></subtitle-panel>`);
    cleanup = result.cleanup;
    const emptyEl = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await emptyEl.updateComplete;
    await flushUpdates();
    expect(emptyEl.shadowRoot?.querySelector('ui-button[aria-label="更新字幕"]')).toBeNull();
  });

  it('updates subtitle with overwrite when update action is used', async () => {
    const track: SubtitleTrack = {
      id: 'sub-1',
      mediaId: 'a',
      title: 'Track A',
      filename: 'Track A.srt',
      type: 'srt',
      contentHash: 'hash',
      segments: [{ id: 's1', startTime: 0, endTime: 2, text: 'hello updated' }],
    };
    importSubtitleForMedia.mockResolvedValue({
      imported: [track],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    const el = await renderPanel();
    clickShadowButtonByLabel(el, '更新字幕');
    const input = el.shadowRoot!.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['1'], 'Track A.srt', { type: 'application/x-subrip' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(importSubtitleForMedia).toHaveBeenCalledWith('a', file, { overwrite: true });
  });

  it('prompts before importing mismatched subtitle filename', async () => {
    const el = await renderPanel();
    const input = el.shadowRoot!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['1'], 'NotTrack.srt', { type: 'application/x-subrip' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(importSubtitleForMedia).not.toHaveBeenCalled();
    const modal = el.shadowRoot?.querySelector('ui-modal') as HTMLElement & { open?: boolean };
    expect(modal?.open).toBe(true);
  });

  it('imports mismatched subtitle after confirmation', async () => {
    const track: SubtitleTrack = {
      id: 'sub-1',
      mediaId: 'a',
      title: 'NotTrack',
      filename: 'NotTrack.srt',
      type: 'srt',
      contentHash: 'hash',
      segments: [{ id: 's1', startTime: 0, endTime: 2, text: 'hello' }],
    };
    importSubtitleForMedia.mockResolvedValue({
      imported: [track],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });

    const el = await renderPanel();
    const input = el.shadowRoot!.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['1'], 'NotTrack.srt', { type: 'application/x-subrip' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    const modal = el.shadowRoot?.querySelector('ui-modal') as HTMLElement & { open?: boolean };
    modal?.dispatchEvent(new CustomEvent('ok', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(importSubtitleForMedia).toHaveBeenCalledWith('a', file, {});
  });

  it('shows subtitle import error when import throws', async () => {
    importSubtitleForMedia.mockRejectedValue(new Error('fail'));
    controller = new MediaController();
    await controller.loadTracks([makeTrack('a', 'Track A', [])]);
    const result = mount(html`<subtitle-panel .controller=${controller}></subtitle-panel>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
    await el.updateComplete;
    await flushUpdates();

    const errorSpy = vi.spyOn(Message, 'error');
    const input = el.shadowRoot!.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['1'], 'Track A.srt', { type: 'application/x-subrip' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('导入字幕失败') }),
    );
  });

  it('requests echo recording from segment row in echo mode', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.echoMode = true;
    await el.updateComplete;
    await flushUpdates();

    const requested = vi.fn();
    el.addEventListener('echo-record-request', requested);

    const recordButton = el.shadowRoot?.querySelector(
      '.row-actions ui-button[aria-label="跟读"]',
    ) as HTMLElement | null;
    recordButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(requested).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { segmentIndex: 0 } }),
    );
  });

  it('shows delete tip on disabled echo record button when segment at limit', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.echoMode = true;
    el.echoLimitPerSegment = 1;
    el.echoRecordingsBySegmentId = {
      s1: [
        {
          id: 'r1',
          mediaId: 'a',
          mediaTitle: 'Track A',
          mediaFilename: 'Track A.mp3',
          mode: 'echo',
          segmentId: 's1',
          mimeType: 'audio/webm',
          createdAt: 1,
          sourceDuration: 2,
          recordingDuration: 2,
          segments: [],
        },
      ],
    };
    await el.updateComplete;
    await flushUpdates();

    const recordButton = el.shadowRoot?.querySelector(
      '.row-actions ui-button[aria-label="跟读"]',
    ) as (HTMLElement & { disabled?: boolean }) | null;
    const tooltip = recordButton?.closest('ui-tooltip') as
      | (HTMLElement & { title?: string; disabled?: boolean })
      | null;

    expect(recordButton?.hasAttribute('disabled') || recordButton?.disabled).toBe(true);
    expect(tooltip?.disabled).toBe(false);
    expect(tooltip?.title).toContain('删除旧录音后可继续');
  });

  it('stops echo recording when active row record button is clicked', async () => {
    const el = await renderPanel({ subtitlesVisible: true });
    el.echoMode = true;
    el.echoRecordingSegmentIndex = 0;
    await el.updateComplete;
    await flushUpdates();

    const stopped = vi.fn();
    el.addEventListener('echo-record-stop', stopped);

    const stopButton = el.shadowRoot?.querySelector(
      '.row-actions ui-button[aria-label="停止"]',
    ) as HTMLElement | null;
    stopButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(stopped).toHaveBeenCalled();
  });

  it('hides fullscreen control when showFullscreenIcon is false', async () => {
    const el = await renderPanel({ showFullscreenIcon: false });
    const buttons = el.shadowRoot?.querySelectorAll('ui-button') ?? [];
    const labels = [...buttons].map((btn) => btn.getAttribute('aria-label') ?? '');
    expect(labels.some((label) => label.includes('全屏'))).toBe(false);
  });

  it('emits enter-fullscreen when controlled fullscreen becomes true', async () => {
    const el = await renderPanel({ fullscreen: false });
    const entered = vi.fn();
    el.addEventListener('enter-fullscreen', entered);

    el.fullscreen = true;
    await el.updateComplete;
    await flushUpdates();

    expect(entered).toHaveBeenCalled();
  });

  describe('shadowing range selection', () => {
    async function renderRangePanel(
      overrides: Partial<{
        shadowingMode: boolean;
        shadowingRangeSelectActive: boolean;
        shadowingRangeAnchor: number | null;
        shadowingRange: { start: number; end: number } | null;
        shadowingRangeConfirmed: boolean;
        shadowingRangeFocus: boolean;
        seekDisabled: boolean;
      }> = {},
    ) {
      controller = new MediaController();
      const segments: SubtitleSegment[] = [
        { id: 's1', startTime: 0, endTime: 2, text: 'hello' },
        { id: 's2', startTime: 2, endTime: 4, text: 'world' },
        { id: 's3', startTime: 4, endTime: 6, text: 'foo' },
        { id: 's4', startTime: 6, endTime: 8, text: 'bar' },
      ];
      await controller.loadTracks([makeTrack('a', 'Track A', segments)]);
      controller.setSubtitlesVisible(true);

      const result = mount(html`
        <subtitle-panel
          .controller=${controller}
          .shadowingMode=${overrides.shadowingMode ?? true}
          .shadowingRangeSelectActive=${overrides.shadowingRangeSelectActive ?? false}
          .shadowingRangeAnchor=${overrides.shadowingRangeAnchor ?? null}
          .shadowingRange=${overrides.shadowingRange ?? null}
          .shadowingRangeConfirmed=${overrides.shadowingRangeConfirmed ?? false}
          .shadowingRangeFocus=${overrides.shadowingRangeFocus ?? false}
          .seekDisabled=${overrides.seekDisabled ?? false}
        ></subtitle-panel>
      `);
      cleanup = result.cleanup;
      const el = result.container.querySelector('subtitle-panel') as SubtitlePanel;
      await el.updateComplete;
      await flushUpdates();
      return el;
    }

    it('shows fullscreen range chip when range is set in fullscreen mode', async () => {
      const el = await renderRangePanel({
        shadowingMode: true,
        shadowingRange: { start: 0, end: 2 },
      });
      el.fullscreen = true;
      await el.updateComplete;
      await flushUpdates();

      const chip = getPortalShadow('[data-subtitle-fullscreen-portal]')?.querySelector(
        '.fullscreen-range-chip',
      );
      expect(chip?.textContent).toContain('#1–#3');
    });

    it('dispatches shadowing-range-click instead of seeking when range select is active', async () => {
      const el = await renderRangePanel({
        shadowingRangeSelectActive: true,
      });
      const seekSpy = vi.spyOn(controller, 'seekToSegment');
      const rangeClicked = vi.fn();
      el.addEventListener('shadowing-range-click', rangeClicked);

      const row = el.shadowRoot?.querySelector('[data-segment-index="1"]') as HTMLElement;
      row?.click();
      await el.updateComplete;

      expect(rangeClicked).toHaveBeenCalledWith(expect.objectContaining({ detail: { index: 1 } }));
      expect(seekSpy).not.toHaveBeenCalled();
    });

    it('does not dispatch range click when confirmed', async () => {
      const el = await renderRangePanel({
        shadowingRangeSelectActive: true,
        shadowingRangeConfirmed: true,
        shadowingRange: { start: 0, end: 1 },
      });
      const rangeClicked = vi.fn();
      el.addEventListener('shadowing-range-click', rangeClicked);

      const row = el.shadowRoot?.querySelector('[data-segment-index="2"]') as HTMLElement;
      row?.click();

      expect(rangeClicked).not.toHaveBeenCalled();
    });

    it('highlights segments within the range', async () => {
      const el = await renderRangePanel({
        shadowingRangeSelectActive: true,
        shadowingRange: { start: 0, end: 2 },
      });

      const rows = [...(el.shadowRoot?.querySelectorAll('.segment') ?? [])];
      expect(rows[0]?.classList.contains('range-selected')).toBe(true);
      expect(rows[0]?.classList.contains('range-edge-start')).toBe(true);
      expect(rows[0]?.classList.contains('range-edge-end')).toBe(false);
      expect(rows[1]?.classList.contains('range-selected')).toBe(true);
      expect(rows[1]?.classList.contains('range-edge-start')).toBe(false);
      expect(rows[1]?.classList.contains('range-edge-end')).toBe(false);
      expect(rows[2]?.classList.contains('range-selected')).toBe(true);
      expect(rows[2]?.classList.contains('range-edge-end')).toBe(true);
      expect(rows[2]?.classList.contains('range-edge-start')).toBe(false);
      expect(rows[3]?.classList.contains('range-selected')).toBe(false);
    });

    it('outlines a single-sentence range on all sides', async () => {
      const el = await renderRangePanel({
        shadowingRangeSelectActive: true,
        shadowingRange: { start: 2, end: 2 },
      });

      const row = el.shadowRoot?.querySelector('[data-segment-index="2"]');
      expect(row?.classList.contains('range-selected')).toBe(true);
      expect(row?.classList.contains('range-edge-start')).toBe(true);
      expect(row?.classList.contains('range-edge-end')).toBe(true);
    });

    it('marks anchor segment', async () => {
      const el = await renderRangePanel({
        shadowingRangeSelectActive: true,
        shadowingRangeAnchor: 2,
      });

      const rows = [...(el.shadowRoot?.querySelectorAll('.segment') ?? [])];
      expect(rows[2]?.classList.contains('range-anchor')).toBe(true);
      expect(rows[0]?.classList.contains('range-anchor')).toBe(false);
    });

    it('shows only range segments when focus mode is on', async () => {
      const el = await renderRangePanel({
        shadowingRangeSelectActive: true,
        shadowingRange: { start: 1, end: 2 },
        shadowingRangeFocus: true,
      });

      const rows = [...(el.shadowRoot?.querySelectorAll('.segment') ?? [])];
      expect(rows).toHaveLength(2);
      expect(rows[0]?.getAttribute('data-segment-index')).toBe('1');
      expect(rows[1]?.getAttribute('data-segment-index')).toBe('2');
      expect(rows.every((row) => !row.classList.contains('range-selected'))).toBe(true);
    });

    it('renders all segments when focus is off', async () => {
      const el = await renderRangePanel({
        shadowingRangeSelectActive: true,
        shadowingRange: { start: 1, end: 2 },
        shadowingRangeFocus: false,
      });

      const rows = [...(el.shadowRoot?.querySelectorAll('.segment') ?? [])];
      expect(rows).toHaveLength(4);
    });
  });
});
