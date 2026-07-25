import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../../test/db-helpers.js';
import { flushUpdates, mount } from '../../components/ui/test-utils.js';
import * as layoutCompact from '../../lib/layout-compact.js';
import './index.js';
import type { LibraryPage } from './index.js';
import type { MediaList } from '../../components/library/media-list.js';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('library-page', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  async function renderPage() {
    const result = mount(html`<library-page></library-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('library-page') as LibraryPage;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  it('renders library controls and content panes', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    expect(el.shadowRoot?.querySelectorAll('ui-select').length).toBe(2);
    expect(el.shadowRoot?.querySelector('ui-input')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-icon[name="search"]')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('media-list')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('record-list')).not.toBeNull();
    expect(el.compact).toBe(false);
    expect(
      (el.shadowRoot?.querySelector('media-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(true);
    expect(
      (el.shadowRoot?.querySelector('record-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(true);
  });

  it('reflects compact viewport from matchMedia', async () => {
    stubMatchMedia(true);
    const el = await renderPage();
    expect(el.compact).toBe(true);
    expect(el.hasAttribute('compact')).toBe(true);
    expect(
      (el.shadowRoot?.querySelector('media-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(false);
  });

  it('enters compact when the stacked list area is too small', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const stack = el.shadowRoot?.querySelector('.stack') as HTMLElement;
    Object.defineProperty(stack, 'clientHeight', { configurable: true, get: () => 200 });
    (el as unknown as { _syncCompactFromSpace: () => void })._syncCompactFromSpace();
    await el.updateComplete;

    expect(el.compact).toBe(true);
  });

  it('exits compact when the stack budget is large enough', async () => {
    stubMatchMedia(false);
    const measureSpy = vi.spyOn(layoutCompact, 'measurePageViewportHeight').mockReturnValue(1200);
    const el = await renderPage();
    el.compact = true;
    await el.updateComplete;

    const toolbar = el.shadowRoot?.querySelector('.toolbar') as HTMLElement;
    const hint = el.shadowRoot?.querySelector('.hint') as HTMLElement;
    Object.defineProperty(toolbar, 'offsetHeight', { configurable: true, value: 48 });
    Object.defineProperty(hint, 'offsetHeight', { configurable: true, value: 20 });

    (el as unknown as { _syncCompactFromSpace: () => void })._syncCompactFromSpace();
    await el.updateComplete;

    expect(el.compact).toBe(false);
    measureSpy.mockRestore();
  });

  it('passes search and sort state to all library lists', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const search = el.shadowRoot?.querySelector('ui-input.search') as HTMLElement;
    search.dispatchEvent(
      new CustomEvent('change', { detail: { value: '  rain  ' }, bubbles: true, composed: true }),
    );
    await el.updateComplete;

    const selects = el.shadowRoot?.querySelectorAll('ui-select') ?? [];
    selects[0]?.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'title' }, bubbles: true, composed: true }),
    );
    selects[1]?.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'asc' }, bubbles: true, composed: true }),
    );
    await el.updateComplete;

    const mediaList = el.shadowRoot?.querySelector('media-list') as MediaList;
    const recordList = el.shadowRoot?.querySelector('record-list') as HTMLElement & {
      keyword: string;
      sortBy: string;
      sortDirection: string;
    };
    const noiseList = el.shadowRoot?.querySelector('noise-list') as HTMLElement & {
      keyword: string;
      sortBy: string;
      sortDirection: string;
    };

    expect(mediaList.keyword).toBe('rain');
    expect(mediaList.sortBy).toBe('title');
    expect(mediaList.sortDirection).toBe('asc');
    expect(recordList.keyword).toBe('rain');
    expect(noiseList.keyword).toBe('rain');
  });

  it('allocates explicit heights from list metrics in fill mode', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const stack = el.shadowRoot?.querySelector('.stack') as HTMLElement;
    Object.defineProperty(stack, 'clientHeight', { configurable: true, get: () => 900 });

    const mediaList = el.shadowRoot?.querySelector('media-list') as HTMLElement;
    mediaList.dispatchEvent(
      new CustomEvent('list-metrics', {
        detail: { naturalHeight: 400 },
        bubbles: true,
        composed: true,
      }),
    );
    el.shadowRoot
      ?.querySelector('record-list')
      ?.dispatchEvent(
        new CustomEvent('list-metrics', {
          detail: { naturalHeight: 300 },
          bubbles: true,
          composed: true,
        }),
      );
    el.shadowRoot
      ?.querySelector('noise-list')
      ?.dispatchEvent(
        new CustomEvent('list-metrics', {
          detail: { naturalHeight: 200 },
          bubbles: true,
          composed: true,
        }),
      );
    await el.updateComplete;

    expect(mediaList.style.height).not.toBe('');
    expect(el.shadowRoot?.querySelector('record-list')?.getAttribute('class')).not.toContain(
      'pending',
    );
  });

  it('navigates to practice when media is selected', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);

    el.shadowRoot?.querySelector('media-list')?.dispatchEvent(
      new CustomEvent('media-selected', {
        detail: { id: 'media-42' },
        bubbles: true,
        composed: true,
      }),
    );

    expect(navigateSpy).toHaveBeenCalledWith('/practice?mediaId=media-42');
  });

  it('clears allocated heights when switching to compact mode', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    (
      el as unknown as { _mediaHeight: number; _recordHeight: number; _noiseHeight: number }
    )._mediaHeight = 120;
    (el as unknown as { _recordHeight: number })._recordHeight = 120;
    (el as unknown as { _noiseHeight: number })._noiseHeight = 120;

    (el as unknown as { _setCompact: (next: boolean) => void })._setCompact(true);
    await el.updateComplete;

    expect((el as unknown as { _mediaHeight: number })._mediaHeight).toBe(0);
    expect((el as unknown as { _recordHeight: number })._recordHeight).toBe(0);
    expect((el as unknown as { _noiseHeight: number })._noiseHeight).toBe(0);
  });
});
