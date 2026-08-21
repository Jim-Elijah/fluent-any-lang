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
    } = {},
  ) {
    controller = new MediaController();
    const segments: SubtitleSegment[] = [
      { id: 's1', startTime: 0, endTime: 2, text: 'hello' },
      { id: 's2', startTime: 2, endTime: 4, text: 'world' },
    ];
    await controller.loadTracks([makeTrack('a', 'Track A', segments)]);

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

  function clickShadowButtonByLabel(el: SubtitlePanel, keyword: string): void {
    const buttons = [...(el.shadowRoot?.querySelectorAll('ui-button') ?? [])];
    const button = buttons.find((item) =>
      (item.getAttribute('aria-label') ?? '').includes(keyword),
    );
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  }

  it('opens fullscreen portal in uncontrolled mode', async () => {
    const el = await renderPanel();
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
    const el = await renderPanel();
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
    const el = await renderPanel({ defaultFullscreen: true });
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
    const el = await renderPanel();
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

  it('shows an overall badge inside segment text when a score is present', async () => {
    const el = await renderPanel();
    el.echoMode = true;
    el.echoLatestScoreBySegmentId = { s1: 84.2 };
    await el.updateComplete;
    await flushUpdates();

    const badge = el.shadowRoot?.querySelector('p.text:not(.translation) .echo-score');
    expect(badge?.textContent?.trim()).toBe('84');
    expect(el.shadowRoot?.querySelector('.row-actions .echo-score')).toBeNull();
  });

  it('requests echo manage recordings when manage button is clicked', async () => {
    const el = await renderPanel();
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
    const el = await renderPanel({ seekDisabled: true });
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
    const el = await renderPanel({ seekDisabled: true });
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
    const el = await renderPanel();
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
    const el = await renderPanel();
    clickShadowButtonByLabel(el, '隐藏字幕');
    await el.updateComplete;
    await flushUpdates();

    expect(el.shadowRoot?.textContent).toContain('字幕已隐藏');
  });

  it('dispatches sentence-bank-add when segment is not saved', async () => {
    const el = await renderPanel();
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
    const el = await renderPanel();
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
    const el = await renderPanel();
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
    const el = await renderPanel();
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
    const el = await renderPanel();
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
    const el = await renderPanel();
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
});
