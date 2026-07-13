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

import './index.js';
import type { HomePage } from './index.js';
import type { MediaList } from '../../components/library/media-list.js';
import { mount } from '../../components/ui/test-utils.js';

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

describe('home-page', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  async function renderPage() {
    const result = mount(html`<home-page></home-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('home-page') as HomePage;
    await el.updateComplete;
    return el;
  }

  it('renders dashboard, importer and library sections with fill-height when tall', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    expect(el.shadowRoot?.querySelector('practice-stats-dashboard')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('content-importer')).not.toBeNull();
    const mediaList = el.shadowRoot?.querySelector('media-list') as MediaList | null;
    expect(mediaList).not.toBeNull();
    expect(mediaList?.limit).toBe(10);
    expect(mediaList?.fillHeight).toBe(true);
    expect(el.compact).toBe(false);
  });

  it('disables fill-height in compact short viewport', async () => {
    stubMatchMedia(true);
    const el = await renderPage();
    expect(el.compact).toBe(true);
    const mediaList = el.shadowRoot?.querySelector('media-list') as MediaList | null;
    expect(mediaList?.fillHeight).toBe(false);
  });

  it('enters compact when media-list height is too small', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    expect(el.compact).toBe(false);

    const list = el.shadowRoot?.querySelector('media-list') as HTMLElement;
    Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => 120 });
    // ResizeObserver callbacks are async in some environments; call sync path via update.
    (el as unknown as { _syncCompactFromSpace: () => void })._syncCompactFromSpace();
    await el.updateComplete;

    expect(el.compact).toBe(true);
    expect((el.shadowRoot?.querySelector('media-list') as MediaList).fillHeight).toBe(false);
  });
});
