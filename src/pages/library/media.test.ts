import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { flushUpdates, mount } from '../../components/ui/test-utils.js';
import './media.js';
import type { LibraryMediaPage } from './media.js';
import type { MediaList } from '../../components/library/media-list.js';
import type { LibraryListToolbarChangeDetail } from '../../components/library/library-list-toolbar.js';

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

describe('library-media-page', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  async function renderPage() {
    const result = mount(html`<library-media-page></library-media-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('library-media-page') as LibraryMediaPage;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  it('renders toolbar and media list, and hides back without the hub hash', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const back = el.shadowRoot?.querySelector('library-section-back') as HTMLElement;
    expect(back.hidden).toBe(true);
    expect(back.shadowRoot?.querySelector('button')).toBeNull();
    expect(el.shadowRoot?.querySelector('library-list-toolbar')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('media-list')).not.toBeNull();
    expect(el.compact).toBe(false);
    expect(
      (el.shadowRoot?.querySelector('media-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(true);
  });

  it('passes search and sort state to media list', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const toolbar = el.shadowRoot?.querySelector('library-list-toolbar') as HTMLElement;
    toolbar.dispatchEvent(
      new CustomEvent<LibraryListToolbarChangeDetail>('filters-change', {
        detail: { keyword: 'rain', sortBy: 'title', sortDirection: 'asc' },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    const mediaList = el.shadowRoot?.querySelector('media-list') as MediaList;
    expect(mediaList.keyword).toBe('rain');
    expect(mediaList.sortBy).toBe('title');
    expect(mediaList.sortDirection).toBe('asc');
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

  it('reflects compact viewport from matchMedia', async () => {
    stubMatchMedia(true);
    const el = await renderPage();
    expect(el.compact).toBe(true);
    expect(
      (el.shadowRoot?.querySelector('media-list') as HTMLElement).hasAttribute('fill-height'),
    ).toBe(false);
  });
});
