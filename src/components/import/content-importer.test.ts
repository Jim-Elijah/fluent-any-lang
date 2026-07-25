import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importContentFiles = vi.fn().mockResolvedValue({
  imported: [],
  errors: [],
  warnings: [],
  skipped: [],
  conflicts: [],
});

vi.mock('../../lib/import-content.js', () => ({
  importContentFiles: (...args: unknown[]) => importContentFiles(...args),
  buildOverwriteOptions: vi.fn(
    (
      decisions: Array<{
        overwrite: boolean;
        conflict: { kind: string; existingMediaId: string; title?: string; mediaType?: string };
      }>,
    ) => {
      const overwriteMediaIds: string[] = [];
      const overwriteTitleTypes: string[] = [];
      const overwriteSubtitleMediaIds: string[] = [];
      for (const { conflict, overwrite } of decisions) {
        if (!overwrite) continue;
        if (conflict.kind === 'media-content') overwriteMediaIds.push(conflict.existingMediaId);
        else if (conflict.kind === 'media-title' && conflict.title && conflict.mediaType) {
          overwriteTitleTypes.push(`${conflict.title}::${conflict.mediaType}`);
        } else if (conflict.kind === 'subtitle-content') {
          overwriteSubtitleMediaIds.push(conflict.existingMediaId);
        }
      }
      if (
        overwriteMediaIds.length === 0 &&
        overwriteTitleTypes.length === 0 &&
        overwriteSubtitleMediaIds.length === 0
      ) {
        return null;
      }
      return { overwriteMediaIds, overwriteTitleTypes, overwriteSubtitleMediaIds };
    },
  ),
}));

vi.mock('../../lib/error-reporter.js', () => ({
  reportError: vi.fn().mockResolvedValue(undefined),
}));

import './content-importer.js';
import type { ContentImporter } from './content-importer.js';
import { mount, flushUpdates } from '../ui/test-utils.js';
import { Message } from '../ui/message.js';
import type { MediaItem } from '../../types/models.js';

type ContentImporterHarness = ContentImporter & {
  _importFiles: (files: File[], options?: object) => Promise<void>;
  _handleConflictConfirm: () => Promise<void>;
  _handleConflictSkipAll: () => void;
  _handleDrop: (event: DragEvent) => void;
  _handleFileInput: (event: Event) => void;
  _reportResult: (result: {
    imported: unknown[];
    errors: unknown[];
    warnings: unknown[];
    skipped: unknown[];
    conflicts: unknown[];
  }) => void;
  _importing: boolean;
  _dragOver: boolean;
  _conflictOverwrite: boolean[];
};

function makeFile(name: string, type: string, content = 'data'): File {
  return new File([content], name, { type });
}

describe('content-importer', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    Message.closeAll();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    importContentFiles.mockReset();
    importContentFiles.mockResolvedValue({
      imported: [],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    Message.closeAll();
  });

  async function renderImporter(props: Partial<ContentImporter> = {}) {
    const result = mount(
      html`<content-importer
        .accept=${props.accept ?? 'audio/*,video/*,.srt,.lrc'}
        ?multiple=${props.multiple ?? true}
      ></content-importer>`,
    );
    cleanup = result.cleanup;
    const el = result.container.querySelector('content-importer') as ContentImporterHarness;
    await el.updateComplete;
    return el;
  }

  it('renders dropzone and file input', async () => {
    const el = await renderImporter();
    expect(el.shadowRoot?.querySelector('.dropzone')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('input[type="file"]')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('ui-button')).not.toBeNull();
  });

  it('exposes accept/multiple for single or multi video-ready picking', async () => {
    const el = await renderImporter();
    const input = el.shadowRoot?.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain('video/*');

    el.multiple = false;
    el.accept = 'video/*,.srt';
    await el.updateComplete;
    expect(input.multiple).toBe(false);
    expect(input.accept).toBe('video/*,.srt');
  });

  it('opens conflict modal when import reports conflicts', async () => {
    importContentFiles.mockResolvedValueOnce({
      imported: [],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [
        {
          kind: 'media-content',
          filename: 'lesson.mp3',
          message: '内容不同',
          existingMediaId: 'id-1',
        },
      ],
    });

    const el = await renderImporter();
    const file = makeFile('lesson.mp3', 'audio/mpeg');
    await el._importFiles([file]);
    await el.updateComplete;

    const modal = el.shadowRoot?.querySelector('ui-modal') as HTMLElement & { open?: boolean };
    expect(modal?.open).toBe(true);
    expect(el.shadowRoot?.textContent).toContain('lesson.mp3');
    expect(el.shadowRoot?.textContent).toContain('内容不同');
  });

  it('toggles drag-over styling and imports dropped files', async () => {
    const imported: MediaItem = {
      id: 'media-1',
      title: 'lesson',
      filename: 'lesson.mp3',
      size: 10,
      type: 'audio',
      mimeType: 'audio/mpeg',
      duration: 12,
      createdAt: 1,
      contentHash: 'hash-1',
      hasSubtitles: false,
    };
    importContentFiles.mockResolvedValueOnce({
      imported: [imported],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    const successSpy = vi.spyOn(Message, 'success');
    const el = await renderImporter();
    const dropzone = el.shadowRoot?.querySelector('.dropzone') as HTMLElement;

    dropzone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el._dragOver).toBe(true);
    expect(dropzone.classList.contains('dragover')).toBe(true);

    dropzone.dispatchEvent(new DragEvent('dragleave', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el._dragOver).toBe(false);

    const importedHandler = vi.fn();
    el.addEventListener('content-imported', importedHandler);
    el._handleDrop({
      preventDefault: () => undefined,
      dataTransfer: { files: [makeFile('lesson.mp3', 'audio/mpeg')] },
    } as unknown as DragEvent);
    await flushUpdates();
    await el.updateComplete;

    expect(importContentFiles).toHaveBeenCalled();
    expect(successSpy).toHaveBeenCalled();
    expect(importedHandler).toHaveBeenCalled();
  });

  it('imports through the hidden file input and clears the input value', async () => {
    importContentFiles.mockResolvedValueOnce({
      imported: [],
      errors: [{ filename: 'bad.txt', message: 'unsupported' }],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    const errorSpy = vi.spyOn(Message, 'error');
    const el = await renderImporter();
    const input = el.shadowRoot?.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [makeFile('bad.txt', 'text/plain')],
    });

    el._handleFileInput({ target: input } as unknown as Event);
    await flushUpdates();
    await el.updateComplete;

    expect(importContentFiles).toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(el.shadowRoot?.querySelector('ui-alert[type="error"]')?.textContent).toContain(
      'bad.txt',
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it('opens the native picker from openPicker', async () => {
    const el = await renderImporter();
    const input = el.shadowRoot?.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    el.openPicker();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('ignores empty file selections', async () => {
    const el = await renderImporter();
    await el._importFiles([]);
    expect(importContentFiles).not.toHaveBeenCalled();
  });

  it('reports skipped files and warnings after a successful import', async () => {
    const infoSpy = vi.spyOn(Message, 'info');
    const warningSpy = vi.spyOn(Message, 'warning');
    importContentFiles.mockResolvedValueOnce({
      imported: [{ id: 'ok', title: 'ok', filename: 'ok.mp3' }],
      errors: [],
      warnings: [{ filename: 'clip.mp4', message: 'large file' }],
      skipped: [{ filename: 'dup.mp3', reason: 'duplicate' }],
      conflicts: [],
    });

    const el = await renderImporter();
    await el._importFiles([makeFile('clip.mp4', 'video/mp4')]);
    await el.updateComplete;

    expect(infoSpy).toHaveBeenCalledWith({ message: '已跳过 1 个重复文件' });
    expect(warningSpy).toHaveBeenCalledWith({ message: 'clip.mp4: large file' });
  });

  it('skips all conflicts and reports partial success', async () => {
    const partial = {
      imported: [{ id: 'ok', title: 'ok', filename: 'ok.mp3' }],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [
        { kind: 'media-content', filename: 'dup.mp3', message: 'dup', existingMediaId: '1' },
      ],
    };
    importContentFiles.mockResolvedValueOnce(partial);
    const successSpy = vi.spyOn(Message, 'success');
    const el = await renderImporter();

    await el._importFiles([makeFile('dup.mp3', 'audio/mpeg')]);
    await el.updateComplete;
    await el._handleConflictSkipAll();
    await el.updateComplete;

    expect(successSpy).toHaveBeenCalledWith({ message: '1 个内容已导入' });
    expect(el.shadowRoot?.querySelector('ui-modal')?.open).toBeFalsy();
  });

  it('confirms overwrite choices and merges second import results', async () => {
    const partial = {
      imported: [],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [
        {
          kind: 'media-content',
          filename: 'lesson.mp3',
          message: '内容不同',
          existingMediaId: 'id-1',
        },
        {
          kind: 'subtitle-content',
          filename: 'lesson.srt',
          message: '字幕冲突',
          existingMediaId: 'id-1',
        },
      ],
    };
    importContentFiles.mockResolvedValueOnce(partial).mockResolvedValueOnce({
      imported: [{ id: 'id-1', title: 'lesson', filename: 'lesson.mp3' }],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });

    const successSpy = vi.spyOn(Message, 'success');
    const el = await renderImporter();
    await el._importFiles([
      makeFile('lesson.mp3', 'audio/mpeg'),
      makeFile('lesson.srt', 'application/x-subrip'),
    ]);
    await el.updateComplete;

    el.shadowRoot
      ?.querySelector('.bulk-actions ui-button:last-child')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;

    await el._handleConflictConfirm();
    await flushUpdates();
    await el.updateComplete;

    expect(importContentFiles).toHaveBeenCalledTimes(2);
    expect(successSpy).toHaveBeenCalledWith({ message: '1 个内容已导入' });
  });

  it('reports partial result when overwrite decisions are all skip', async () => {
    importContentFiles.mockResolvedValueOnce({
      imported: [{ id: 'kept', title: 'kept', filename: 'kept.mp3' }],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [
        { kind: 'media-content', filename: 'lesson.mp3', message: 'dup', existingMediaId: '1' },
      ],
    });
    const successSpy = vi.spyOn(Message, 'success');
    const el = await renderImporter();

    await el._importFiles([makeFile('lesson.mp3', 'audio/mpeg')]);
    await el.updateComplete;
    await el._handleConflictConfirm();
    await el.updateComplete;

    expect(importContentFiles).toHaveBeenCalledTimes(1);
    expect(successSpy).toHaveBeenCalledWith({ message: '1 个内容已导入' });
  });

  it('reports info when unresolved conflicts remain in the result payload', async () => {
    const infoSpy = vi.spyOn(Message, 'info');
    const el = await renderImporter();

    el._reportResult({
      imported: [],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [
        { kind: 'media-content', filename: 'x.mp3', message: 'conflict', existingMediaId: '1' },
      ],
    });

    expect(infoSpy).toHaveBeenCalledWith({ message: '已跳过冲突文件' });
  });

  it('sets all conflict radios to skip or overwrite', async () => {
    importContentFiles.mockResolvedValueOnce({
      imported: [],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [
        { kind: 'media-content', filename: 'a.mp3', message: 'a', existingMediaId: '1' },
        { kind: 'media-content', filename: 'b.mp3', message: 'b', existingMediaId: '2' },
      ],
    });
    const el = await renderImporter();
    await el._importFiles([makeFile('a.mp3', 'audio/mpeg'), makeFile('b.mp3', 'audio/mpeg')]);
    await el.updateComplete;

    el.shadowRoot
      ?.querySelector('.bulk-actions ui-button:first-child')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    expect(el._conflictOverwrite).toEqual([false, false]);

    el.shadowRoot
      ?.querySelector('.bulk-actions ui-button:last-child')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    expect(el._conflictOverwrite).toEqual([true, true]);

    const overwriteRadio = el.shadowRoot?.querySelector(
      '.conflict-item:last-child .conflict-choices label:last-child input',
    ) as HTMLInputElement;
    overwriteRadio?.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    expect(el._conflictOverwrite[1]).toBe(true);
  });

  it('shows a generic error when import throws', async () => {
    importContentFiles.mockRejectedValueOnce(new Error('boom'));
    const errorSpy = vi.spyOn(Message, 'error');
    const el = await renderImporter();

    await el._importFiles([makeFile('lesson.mp3', 'audio/mpeg')]);
    await el.updateComplete;

    expect(errorSpy).toHaveBeenCalledWith({ message: '导入过程中发生未知错误' });
    expect(el._importing).toBe(false);
  });

  it('shows a generic error when conflict resolution throws', async () => {
    importContentFiles
      .mockResolvedValueOnce({
        imported: [],
        errors: [],
        warnings: [],
        skipped: [],
        conflicts: [
          { kind: 'media-content', filename: 'lesson.mp3', message: 'dup', existingMediaId: '1' },
        ],
      })
      .mockRejectedValueOnce(new Error('resolve failed'));
    const errorSpy = vi.spyOn(Message, 'error');
    const el = await renderImporter();

    await el._importFiles([makeFile('lesson.mp3', 'audio/mpeg')]);
    await el.updateComplete;
    el.shadowRoot
      ?.querySelector('.bulk-actions ui-button:last-child')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    await el._handleConflictConfirm();
    await el.updateComplete;

    expect(errorSpy).toHaveBeenCalledWith({ message: '导入过程中发生未知错误' });
  });

  it('marks the dropzone busy while importing', async () => {
    let resolveImport: ((value: unknown) => void) | undefined;
    importContentFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        }),
    );
    const el = await renderImporter();
    const pending = el._importFiles([makeFile('lesson.mp3', 'audio/mpeg')]);
    await el.updateComplete;
    expect(el._importing).toBe(true);
    expect(el.shadowRoot?.querySelector('.dropzone')?.classList.contains('busy')).toBe(true);
    resolveImport?.({
      imported: [],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    await pending;
    await el.updateComplete;
    expect(el._importing).toBe(false);
  });

  it('handles dragover on the dropzone', async () => {
    const el = await renderImporter();
    const dropzone = el.shadowRoot?.querySelector('.dropzone') as HTMLElement;
    dropzone.dispatchEvent(new DragEvent('dragover', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el._dragOver).toBe(true);
  });

  it('ignores conflict skip when modal is already closed', async () => {
    const el = await renderImporter();
    const successSpy = vi.spyOn(Message, 'success').mockClear();
    el._handleConflictSkipAll();
    expect(successSpy).not.toHaveBeenCalled();
  });

  it('ignores duplicate conflict confirm while importing', async () => {
    importContentFiles.mockResolvedValueOnce({
      imported: [],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [
        { kind: 'media-content', filename: 'lesson.mp3', message: 'dup', existingMediaId: '1' },
      ],
    });
    let resolveImport: ((value: unknown) => void) | undefined;
    importContentFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        }),
    );

    const el = await renderImporter();
    await el._importFiles([makeFile('lesson.mp3', 'audio/mpeg')]);
    await el.updateComplete;
    el.shadowRoot
      ?.querySelector('.bulk-actions ui-button:last-child')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;

    const confirmPromise = el._handleConflictConfirm();
    await el._handleConflictConfirm();
    resolveImport?.({
      imported: [{ id: 'id-1', title: 'lesson', filename: 'lesson.mp3' }],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    });
    await confirmPromise;
    await el.updateComplete;

    expect(importContentFiles).toHaveBeenCalledTimes(2);
  });

  it('merges media-title overwrite options on conflict confirm', async () => {
    importContentFiles
      .mockResolvedValueOnce({
        imported: [],
        errors: [],
        warnings: [],
        skipped: [],
        conflicts: [
          {
            kind: 'media-title',
            filename: 'lesson.mp3',
            message: 'title clash',
            existingMediaId: 'id-1',
            title: 'Lesson',
            mediaType: 'audio',
          },
        ],
      })
      .mockResolvedValueOnce({
        imported: [{ id: 'id-1', title: 'Lesson', filename: 'lesson.mp3' }],
        errors: [],
        warnings: [],
        skipped: [],
        conflicts: [],
      });

    const el = await renderImporter();
    await el._importFiles([makeFile('lesson.mp3', 'audio/mpeg')]);
    await el.updateComplete;
    el.shadowRoot
      ?.querySelector('.bulk-actions ui-button:last-child')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    await el.updateComplete;
    await el._handleConflictConfirm();
    await flushUpdates();

    expect(importContentFiles).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.objectContaining({ overwriteTitleTypes: ['Lesson::audio'] }),
    );
  });
});
