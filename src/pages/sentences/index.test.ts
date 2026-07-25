import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SentenceBankEntry } from '../../types/models.js';
import { flushUpdates, mount } from '../../components/ui/test-utils.js';

const mockGetSentenceBankList = vi.fn();
const mockDeleteSentenceBankEntry = vi.fn();
const mockReportError = vi.fn().mockResolvedValue(undefined);

vi.mock('../../db/service.js', () => ({
  getSentenceBankList: (...args: unknown[]) => mockGetSentenceBankList(...args),
  deleteSentenceBankEntry: (...args: unknown[]) => mockDeleteSentenceBankEntry(...args),
}));

vi.mock('../../lib/error-reporter.js', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import './index.js';
import type { SentencesPage } from './index.js';
import { Message } from '../../components/ui/message.js';

function makeEntry(overrides: Partial<SentenceBankEntry> = {}): SentenceBankEntry {
  return {
    id: 'entry-1',
    contentHash: 'hash-1',
    text: 'Hello world',
    translation: '你好世界',
    sourceMediaId: 'media-1',
    sourceSegmentId: 'seg-1',
    sourceStartTime: 0,
    sourceEndTime: 5,
    sourceTitleSnapshot: 'Lesson Alpha',
    sourceMediaType: 'audio',
    sourceAvailable: true,
    removed: false,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

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

describe('sentences-page', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    mockGetSentenceBankList.mockReset();
    mockDeleteSentenceBankEntry.mockReset();
    mockReportError.mockClear();
    Message.closeAll();
    stubMatchMedia(false);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    Message.closeAll();
    vi.unstubAllGlobals();
  });

  async function renderPage() {
    const result = mount(html`<sentences-page></sentences-page>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('sentences-page') as SentencesPage;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  function getEntryTexts(el: SentencesPage): string[] {
    return [...(el.shadowRoot?.querySelectorAll('.text') ?? [])].map(
      (node) => node.textContent?.trim() ?? '',
    );
  }

  it('shows empty state when the sentence bank has no entries', async () => {
    mockGetSentenceBankList.mockResolvedValue([]);
    const el = await renderPage();

    expect(el.shadowRoot?.textContent).toContain('句库为空');
    expect(el.shadowRoot?.querySelectorAll('.item').length).toBe(0);
  });

  it('renders populated entries with metadata', async () => {
    mockGetSentenceBankList.mockResolvedValue([
      makeEntry(),
      makeEntry({
        id: 'entry-2',
        text: 'Second sentence',
        translation: undefined,
        sourceTitleSnapshot: 'Lesson Beta',
        sourceMediaType: 'video',
        sourceAvailable: false,
        createdAt: 1_700_000_100_000,
      }),
    ]);
    const el = await renderPage();

    expect(getEntryTexts(el)).toEqual(['Second sentence', 'Hello world']);
    expect(el.shadowRoot?.textContent).toContain('来自：Lesson Alpha');
    expect(el.shadowRoot?.textContent).toContain('源媒体已删除');
    expect(el.shadowRoot?.textContent).toContain('2 句');
  });

  it('filters entries by keyword across text, translation, and source title', async () => {
    mockGetSentenceBankList.mockResolvedValue([
      makeEntry({ id: 'a', text: 'Apple pie' }),
      makeEntry({
        id: 'b',
        text: 'Banana',
        translation: 'apple tart',
        sourceTitleSnapshot: 'Fruit',
      }),
      makeEntry({ id: 'c', text: 'Cherry', sourceTitleSnapshot: 'Berry Basket' }),
    ]);
    const el = await renderPage();

    const search = el.shadowRoot?.querySelector('ui-input.search') as HTMLElement;
    search.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'apple' }, bubbles: true, composed: true }),
    );
    await el.updateComplete;

    expect(getEntryTexts(el)).toEqual(['Apple pie', 'Banana']);

    search.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'berry' }, bubbles: true, composed: true }),
    );
    await el.updateComplete;

    search.dispatchEvent(
      new CustomEvent('change', {
        detail: { value: 'missing-keyword' },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;
    expect(getEntryTexts(el)).toEqual([]);
    expect(el.shadowRoot?.textContent).toContain('无匹配内容');
  });

  it('sorts entries by date, source, and text', async () => {
    mockGetSentenceBankList.mockResolvedValue([
      makeEntry({ id: 'a', text: 'Zulu', sourceTitleSnapshot: 'Beta', createdAt: 100 }),
      makeEntry({ id: 'b', text: 'Alpha', sourceTitleSnapshot: 'Alpha', createdAt: 300 }),
      makeEntry({ id: 'c', text: 'Mike', sourceTitleSnapshot: 'Charlie', createdAt: 200 }),
    ]);
    const el = await renderPage();
    const selects = el.shadowRoot?.querySelectorAll('ui-select') ?? [];

    selects[0]?.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'text' }, bubbles: true, composed: true }),
    );
    selects[1]?.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'asc' }, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(getEntryTexts(el)).toEqual(['Alpha', 'Mike', 'Zulu']);

    selects[0]?.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'source' }, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(getEntryTexts(el)).toEqual(['Alpha', 'Zulu', 'Mike']);

    selects[0]?.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'date' }, bubbles: true, composed: true }),
    );
    selects[1]?.dispatchEvent(
      new CustomEvent('change', { detail: { value: 'desc' }, bubbles: true, composed: true }),
    );
    await el.updateComplete;
    expect(getEntryTexts(el)).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('deletes an entry after confirm and shows success message', async () => {
    mockGetSentenceBankList.mockResolvedValue([makeEntry()]);
    mockDeleteSentenceBankEntry.mockResolvedValue(undefined);
    const el = await renderPage();
    const successSpy = vi.spyOn(Message, 'success');

    const popconfirm = el.shadowRoot?.querySelector('ui-popconfirm') as HTMLElement;
    popconfirm.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(mockDeleteSentenceBankEntry).toHaveBeenCalledWith('entry-1');
    expect(successSpy).toHaveBeenCalled();
    expect(el.shadowRoot?.querySelectorAll('.item').length).toBe(0);
  });

  it('reports delete failures and keeps the entry visible', async () => {
    mockGetSentenceBankList.mockResolvedValue([makeEntry()]);
    mockDeleteSentenceBankEntry.mockRejectedValue(new Error('db fail'));
    const el = await renderPage();
    const errorSpy = vi.spyOn(Message, 'error');

    el.shadowRoot
      ?.querySelector('ui-popconfirm')
      ?.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(mockReportError).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(el.shadowRoot?.querySelectorAll('.item').length).toBe(1);
  });

  it('reflects compact viewport from matchMedia', async () => {
    stubMatchMedia(true);
    mockGetSentenceBankList.mockResolvedValue([]);
    const el = await renderPage();
    expect(el.compact).toBe(true);
    expect(el.hasAttribute('compact')).toBe(true);
  });

  it('shows load error and reports failure', async () => {
    mockGetSentenceBankList.mockRejectedValue(new Error('load failed'));
    const el = await renderPage();

    expect(mockReportError).toHaveBeenCalled();
    expect(el.shadowRoot?.querySelector('ui-alert.error')?.textContent).toContain('加载句库失败');
  });

  it('navigates to sentence practice and warns when source is unavailable', async () => {
    mockGetSentenceBankList.mockResolvedValue([
      makeEntry(),
      makeEntry({ id: 'entry-2', sourceAvailable: false }),
    ]);
    const el = await renderPage();
    const navigateSpy = vi.spyOn(el, 'navigate').mockImplementation(() => undefined);
    const warningSpy = vi.spyOn(Message, 'warning');

    const firstItem = el.shadowRoot?.querySelectorAll('.item')[0];
    firstItem
      ?.querySelectorAll('.actions ui-button')[0]
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(navigateSpy).toHaveBeenCalledWith('/sentence-practice?id=entry-1');

    const unavailableItem = el.shadowRoot?.querySelectorAll('.item')[1];
    unavailableItem
      ?.querySelectorAll('.actions ui-button')[1]
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(warningSpy).toHaveBeenCalled();

    navigateSpy.mockClear();
    firstItem
      ?.querySelectorAll('.actions ui-button')[1]
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(navigateSpy).toHaveBeenCalledWith('/practice?mediaId=media-1&segmentId=seg-1');
  });

  it('updates compact flag when viewport media query changes', async () => {
    const listeners = new Map<string, (event: MediaQueryListEvent) => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((type: string, cb: (event: MediaQueryListEvent) => void) => {
          listeners.set(type, cb);
        }),
        removeEventListener: vi.fn((type: string) => {
          listeners.delete(type);
        }),
        dispatchEvent: vi.fn(),
      })),
    );
    mockGetSentenceBankList.mockResolvedValue([]);
    const el = await renderPage();
    expect(el.compact).toBe(false);

    listeners.get('change')?.({ matches: true } as MediaQueryListEvent);
    await el.updateComplete;
    expect(el.compact).toBe(true);
  });
});
