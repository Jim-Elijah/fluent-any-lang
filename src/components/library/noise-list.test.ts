import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoiseItem } from '../../types/models.js';
import { flushUpdates, mount } from '../ui/test-utils.js';

const mockGetNoiseList = vi.fn();
const mockDeleteNoise = vi.fn();
const mockImportNoiseFiles = vi.fn();
const mockReportError = vi.fn().mockResolvedValue(undefined);

vi.mock('../../db/noise.js', () => ({
  getNoiseList: (...args: unknown[]) => mockGetNoiseList(...args),
  deleteNoise: (...args: unknown[]) => mockDeleteNoise(...args),
}));

vi.mock('../../lib/import-noise.js', () => ({
  importNoiseFiles: (...args: unknown[]) => mockImportNoiseFiles(...args),
}));

vi.mock('../../lib/error-reporter.js', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import './noise-list.js';
import type { NoiseList } from './noise-list.js';
import { Message } from '../ui/message.js';

function makeItem(overrides: Partial<NoiseItem> = {}): NoiseItem {
  return {
    id: 'noise-1',
    title: 'Rain',
    filename: 'rain.mp3',
    mimeType: 'audio/mpeg',
    size: 1024,
    duration: 30,
    createdAt: 100,
    ...overrides,
  };
}

describe('noise-list', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    mockGetNoiseList.mockReset();
    mockDeleteNoise.mockReset();
    mockImportNoiseFiles.mockReset();
    mockReportError.mockClear();
    Message.closeAll();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    Message.closeAll();
  });

  async function renderList(props: Partial<NoiseList> = {}) {
    const result = mount(
      html`<noise-list
        .keyword=${props.keyword ?? ''}
        .sortBy=${props.sortBy ?? 'date'}
        .sortDirection=${props.sortDirection ?? 'desc'}
        ?fillHeight=${props.fillHeight ?? false}
      ></noise-list>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('noise-list') as NoiseList;
    await el.updateComplete;
    await flushUpdates();
    return el;
  }

  function getTitles(el: NoiseList): string[] {
    return [...(el.shadowRoot?.querySelectorAll('.title') ?? [])].map(
      (node) => node.textContent?.trim() ?? '',
    );
  }

  it('shows empty state when there are no noise items', async () => {
    mockGetNoiseList.mockResolvedValue([]);
    const el = await renderList();
    expect(el.shadowRoot?.textContent).toContain('暂无噪音素材');
  });

  it('renders items sorted by date descending', async () => {
    mockGetNoiseList.mockResolvedValue([
      makeItem(),
      makeItem({ id: 'noise-2', title: 'Wind', createdAt: 200 }),
    ]);
    const el = await renderList();

    expect(getTitles(el)).toEqual(['Wind', 'Rain']);
    expect(el.shadowRoot?.textContent).toContain('2 项');
    expect(el.shadowRoot?.querySelector('.list-viewport')).not.toBeNull();
  });

  it('filters and sorts items from parent props', async () => {
    mockGetNoiseList.mockResolvedValue([
      makeItem({ id: 'a', title: 'Alpha', filename: 'alpha.mp3', createdAt: 100 }),
      makeItem({ id: 'b', title: 'Beta Rain', filename: 'beta.mp3', createdAt: 200 }),
    ]);
    const el = await renderList({ keyword: 'rain', sortBy: 'title', sortDirection: 'asc' });
    expect(getTitles(el)).toEqual(['Beta Rain']);
    expect(el.shadowRoot?.textContent).toContain('1 项');
  });

  it('shows load error when refresh fails', async () => {
    mockGetNoiseList.mockRejectedValue(new Error('db'));
    const el = await renderList();
    expect(el.shadowRoot?.querySelector('ui-alert')?.textContent).toContain('无法加载噪音素材');
  });

  it('imports files and deletes after confirm', async () => {
    mockGetNoiseList.mockResolvedValue([makeItem()]);
    mockImportNoiseFiles.mockResolvedValue({
      imported: [{ id: 'noise-2', title: 'New' }],
      skipped: [{ filename: 'skip.mp3', message: 'duplicate' }],
      errors: [{ filename: 'bad.mp3', message: 'invalid' }],
    });
    mockDeleteNoise.mockResolvedValue(undefined);
    const el = await renderList();
    const successSpy = vi.spyOn(Message, 'success');
    const infoSpy = vi.spyOn(Message, 'info');
    const errorSpy = vi.spyOn(Message, 'error');

    const input = el.shadowRoot?.querySelector('#noise-file-input') as HTMLInputElement;
    const file = new File(['audio'], 'new.mp3', { type: 'audio/mpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(mockImportNoiseFiles).toHaveBeenCalled();
    expect(successSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    el.shadowRoot
      ?.querySelector('ui-popconfirm')
      ?.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();

    expect(mockDeleteNoise).toHaveBeenCalledWith('noise-1');
  });

  it('reports import and delete failures', async () => {
    mockGetNoiseList.mockResolvedValue([makeItem()]);
    mockImportNoiseFiles.mockRejectedValue(new Error('import fail'));
    mockDeleteNoise.mockRejectedValue(new Error('delete fail'));
    const el = await renderList();
    const errorSpy = vi.spyOn(Message, 'error');

    const input = el.shadowRoot?.querySelector('#noise-file-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      value: [new File(['audio'], 'new.mp3', { type: 'audio/mpeg' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(mockReportError).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('导入噪音素材失败');

    el.shadowRoot
      ?.querySelector('ui-popconfirm')
      ?.dispatchEvent(new Event('confirm', { bubbles: true, composed: true }));
    await el.updateComplete;
    await flushUpdates();
    expect(errorSpy).toHaveBeenCalledWith('删除失败');
  });

  it('shows no-match empty message when keyword filters everything out', async () => {
    mockGetNoiseList.mockResolvedValue([makeItem()]);
    const el = await renderList({ keyword: 'missing' });
    expect(el.shadowRoot?.textContent).toContain('无匹配噪音素材');
  });
});
