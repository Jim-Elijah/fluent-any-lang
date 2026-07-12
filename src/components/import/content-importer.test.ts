import { html } from 'lit';
import { afterEach, describe, expect, it, vi } from 'vitest';

const importContentFiles = vi.fn().mockResolvedValue({
  imported: [],
  errors: [],
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

import './content-importer.js';
import type { ContentImporter } from './content-importer.js';
import { mount } from '../ui/test-utils.js';

describe('content-importer', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    importContentFiles.mockReset();
    importContentFiles.mockResolvedValue({
      imported: [],
      errors: [],
      skipped: [],
      conflicts: [],
    });
  });

  async function renderImporter() {
    const result = mount(html`<content-importer></content-importer>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('content-importer') as ContentImporter;
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
    const file = new File(['v2'], 'lesson.mp3', { type: 'audio/mpeg' });
    await (el as unknown as { _importFiles: (files: File[]) => Promise<void> })._importFiles([
      file,
    ]);
    await el.updateComplete;

    const modal = el.shadowRoot?.querySelector('ui-modal') as HTMLElement & { open?: boolean };
    expect(modal?.open).toBe(true);
    expect(el.shadowRoot?.textContent).toContain('lesson.mp3');
    expect(el.shadowRoot?.textContent).toContain('内容不同');
  });
});
