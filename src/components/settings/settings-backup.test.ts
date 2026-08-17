import { html } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/models.js';

vi.mock('../../lib/backup/index.js', () => ({
  DEFAULT_BACKUP_EXPORT_OPTIONS: {
    includeMedia: false,
    includeRecordings: true,
    includeSessions: true,
    includeSentenceBank: true,
    includeNoise: true,
  },
  exportBackup: vi.fn(),
  importBackup: vi.fn(),
  previewBackup: vi.fn(),
}));

vi.mock('../../lib/error-reporter.js', () => ({
  reportError: vi.fn(),
}));

import './settings-backup.js';
import type { SettingsBackup } from './settings-backup.js';
import { exportBackup, importBackup, previewBackup } from '../../lib/backup/index.js';
import { reportError } from '../../lib/error-reporter.js';
import { Message } from '../ui/message.js';
import { flushUpdates, mount } from '../ui/test-utils.js';

function queryComponentModal<T extends Element = Element>(
  el: SettingsBackup,
  selector: string,
): T | null {
  const modal = el.shadowRoot?.querySelector('ui-modal');
  return modal?.shadowRoot?.querySelector(selector) as T | null;
}

async function confirmOpenModal(el: SettingsBackup) {
  queryComponentModal<HTMLButtonElement>(el, '.btn.primary')?.click();
  await flushUpdates();
  await el.updateComplete;
}

async function selectBackupFile(el: SettingsBackup, file: File) {
  const input = el.shadowRoot?.querySelector('#backup-file-input') as HTMLInputElement;
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flushUpdates();
  await el.updateComplete;
}

const preview = {
  manifest: {
    version: 5 as const,
    createdAt: 1,
    appVersion: '1.0.0',
    flags: {
      includeMedia: false,
      includeRecordings: true,
      includeSessions: true,
      includeSettings: true as const,
      includePlaylists: true as const,
      includeSentenceBank: true,
      includeNoise: true,
      includePronunciationScores: true,
    },
    counts: {
      media: 1,
      subtitles: 1,
      recordings: 2,
      sessions: 3,
      playlists: 1,
      sentenceBank: 0,
      noise: 0,
      pronunciationScores: 0,
    },
  },
  settings: DEFAULT_SETTINGS,
  hasMediaBlobs: false,
  hasRecordings: true,
  hasSessions: true,
  hasSentenceBank: false,
  hasNoise: false,
  hasPronunciationScores: false,
};

describe('settings-backup', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    Message.closeAll();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    Message.closeAll();
  });

  async function renderBackup() {
    const result = mount(html`<settings-backup></settings-backup>`);
    cleanup = result.cleanup;
    const el = result.container.querySelector('settings-backup') as SettingsBackup;
    await el.updateComplete;
    return el;
  }

  function exportButton(el: SettingsBackup): HTMLButtonElement | null | undefined {
    return el.shadowRoot
      ?.querySelector('ui-button[variant="primary"]')
      ?.shadowRoot?.querySelector('button');
  }

  function importButton(el: SettingsBackup): HTMLButtonElement | null | undefined {
    return el.shadowRoot
      ?.querySelector('ui-button[variant="secondary"]')
      ?.shadowRoot?.querySelector('button');
  }

  it('warns when export has no selected categories', async () => {
    const warning = vi.spyOn(Message, 'warning');
    const el = await renderBackup();

    for (const checkbox of el.shadowRoot?.querySelectorAll('input[type="checkbox"]') ?? []) {
      (checkbox as HTMLInputElement).checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await el.updateComplete;

    exportButton(el)?.click();
    await el.updateComplete;

    expect(warning).toHaveBeenCalledOnce();
    expect(exportBackup).not.toHaveBeenCalled();
  });

  it('exports backup and shows success message', async () => {
    vi.mocked(exportBackup).mockResolvedValue(preview.manifest);
    const success = vi.spyOn(Message, 'success');
    const el = await renderBackup();

    exportButton(el)?.click();
    await el.updateComplete;

    expect(exportBackup).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
  });

  it('reports export errors', async () => {
    vi.mocked(exportBackup).mockRejectedValue(new Error('export failed'));
    const error = vi.spyOn(Message, 'error');
    const el = await renderBackup();

    exportButton(el)?.click();
    await el.updateComplete;

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('export failed');
  });

  it('previews selected backup file and opens import modal', async () => {
    vi.mocked(previewBackup).mockResolvedValue(preview);
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);

    expect(previewBackup).toHaveBeenCalledWith(file);
    expect(queryComponentModal(el, '.dialog')).not.toBeNull();
  });

  it('reports preview errors', async () => {
    vi.mocked(previewBackup).mockRejectedValue(new Error('bad zip'));
    const error = vi.spyOn(Message, 'error');
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('bad zip');
    expect(queryComponentModal(el, '.dialog')).toBeFalsy();
  });

  it('imports backup successfully from modal confirmation', async () => {
    vi.mocked(previewBackup).mockResolvedValue(preview);
    vi.mocked(importBackup).mockResolvedValue({
      settingsApplied: true,
      mediaImported: 1,
      mediaSkipped: 0,
      subtitlesImported: 1,
      subtitlesSkipped: 0,
      recordingsImported: 2,
      recordingsSkipped: 0,
      sessionsImported: 3,
      sessionsSkipped: 0,
      playlistsImported: 1,
      playlistsSkipped: 0,
      sentenceBankImported: 0,
      sentenceBankSkipped: 0,
      noiseImported: 0,
      noiseSkipped: 0,
      pronunciationScoresImported: 0,
      pronunciationScoresSkipped: 0,
      errors: [],
    });
    const success = vi.spyOn(Message, 'success');
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);
    await confirmOpenModal(el);

    expect(importBackup).toHaveBeenCalledWith(file);
    expect(success).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.querySelector('ui-alert')).not.toBeNull();
  });

  it('warns when import completes with partial errors', async () => {
    vi.mocked(previewBackup).mockResolvedValue(preview);
    vi.mocked(importBackup).mockResolvedValue({
      settingsApplied: false,
      mediaImported: 0,
      mediaSkipped: 0,
      subtitlesImported: 0,
      subtitlesSkipped: 0,
      recordingsImported: 0,
      recordingsSkipped: 0,
      sessionsImported: 0,
      sessionsSkipped: 0,
      playlistsImported: 0,
      playlistsSkipped: 0,
      sentenceBankImported: 0,
      sentenceBankSkipped: 0,
      noiseImported: 0,
      noiseSkipped: 0,
      pronunciationScoresImported: 0,
      pronunciationScoresSkipped: 0,
      errors: ['row failed'],
    });
    const warning = vi.spyOn(Message, 'warning');
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);
    await confirmOpenModal(el);

    expect(warning).toHaveBeenCalledOnce();
    expect(el.shadowRoot?.textContent).toContain('row failed');
  });

  it('reports import errors', async () => {
    vi.mocked(previewBackup).mockResolvedValue(preview);
    vi.mocked(importBackup).mockRejectedValue(new Error('import failed'));
    const error = vi.spyOn(Message, 'error');
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);
    await confirmOpenModal(el);

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('import failed');
  });

  it('opens the hidden file input from the import button', async () => {
    const el = await renderBackup();
    const input = el.shadowRoot?.querySelector('#backup-file-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    importButton(el)?.click();

    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('cancels import preview when ui-modal reports closed', async () => {
    vi.mocked(previewBackup).mockResolvedValue(preview);
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);

    expect(queryComponentModal(el, '.dialog')).not.toBeNull();

    el.shadowRoot?.querySelector('ui-modal')?.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(queryComponentModal(el, '.dialog')).toBeNull();
  });

  it('ignores nested update:open when managing import modal', async () => {
    vi.mocked(previewBackup).mockResolvedValue(preview);
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);

    const modal = el.shadowRoot?.querySelector('ui-modal');
    const nested = document.createElement('div');
    modal?.appendChild(nested);
    nested.dispatchEvent(
      new CustomEvent('update:open', {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }),
    );
    await el.updateComplete;

    expect(queryComponentModal(el, '.dialog')).not.toBeNull();
  });

  it('ignores empty file selection', async () => {
    const el = await renderBackup();
    const input = el.shadowRoot?.querySelector('#backup-file-input') as HTMLInputElement;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;

    expect(previewBackup).not.toHaveBeenCalled();
  });

  it('uses fallback message for non-Error import failures', async () => {
    vi.mocked(previewBackup).mockResolvedValue(preview);
    vi.mocked(importBackup).mockRejectedValue('import failed');
    const error = vi.spyOn(Message, 'error');
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);
    await confirmOpenModal(el);

    expect(reportError).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it('renders preview without settings and without media blobs', async () => {
    vi.mocked(previewBackup).mockResolvedValue({
      ...preview,
      settings: null,
      manifest: {
        ...preview.manifest,
        flags: { ...preview.manifest.flags, includeMedia: false },
      },
    });
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);

    expect(el.shadowRoot?.textContent).toMatch(/无/);
    expect(el.shadowRoot?.textContent).toMatch(/包内无媒体/);
  });

  it('shows playlist count in import preview', async () => {
    vi.mocked(previewBackup).mockResolvedValue(preview);
    const el = await renderBackup();
    const file = new File(['zip'], 'backup.zip', { type: 'application/zip' });
    await selectBackupFile(el, file);

    expect(el.shadowRoot?.textContent).toMatch(/播放列表/);
    expect(el.shadowRoot?.textContent).toMatch(/1/);
  });

  it('does not offer a playlist export checkbox', async () => {
    const el = await renderBackup();
    const labels = [...(el.shadowRoot?.querySelectorAll('label.check') ?? [])].map(
      (label) => label.textContent ?? '',
    );
    expect(labels.some((text) => text.includes('播放列表'))).toBe(false);
  });
});
