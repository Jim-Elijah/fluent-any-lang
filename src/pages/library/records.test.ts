import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { flushUpdates, mount } from '../../components/ui/test-utils.js';
import './records.js';
import type { LibraryRecordsPage } from './records.js';
import type { RecordList } from '../../components/library/record-list.js';
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

describe('library-records-page', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.unstubAllGlobals();
  });

  async function renderPage() {
    const result = mount(html`<library-records-page></library-records-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('library-records-page') as LibraryRecordsPage;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  it('shows the speaking-mode filter and passes Echo through to the record list', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const toolbar = el.shadowRoot?.querySelector('library-list-toolbar') as HTMLElement;
    expect(toolbar.hasAttribute('show-mode-filter')).toBe(true);

    toolbar.dispatchEvent(
      new CustomEvent<LibraryListToolbarChangeDetail>('filters-change', {
        detail: { keyword: 'rain', sortBy: 'title', sortDirection: 'asc', mode: 'echo' },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    const recordList = el.shadowRoot?.querySelector('record-list') as RecordList;
    expect(recordList.keyword).toBe('rain');
    expect(recordList.sortBy).toBe('title');
    expect(recordList.sortDirection).toBe('asc');
    expect(recordList.modeFilter).toBe('echo');
  });

  it('clears the record-list mode filter when the toolbar selects all', async () => {
    stubMatchMedia(false);
    const el = await renderPage();
    const toolbar = el.shadowRoot?.querySelector('library-list-toolbar') as HTMLElement;
    toolbar.dispatchEvent(
      new CustomEvent<LibraryListToolbarChangeDetail>('filters-change', {
        detail: { keyword: '', sortBy: 'date', sortDirection: 'desc', mode: 'shadowing' },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    toolbar.dispatchEvent(
      new CustomEvent<LibraryListToolbarChangeDetail>('filters-change', {
        detail: { keyword: '', sortBy: 'date', sortDirection: 'desc', mode: 'all' },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    const recordList = el.shadowRoot?.querySelector('record-list') as RecordList;
    expect(recordList.modeFilter).toBeUndefined();
  });
});
