import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PracticeRecord } from '../types/models.js';
import { downloadBlob, estimateStorage, formatRecordingFileName } from './export-content.js';

vi.mock('../db/service.js', () => ({
  getRecordingBlob: vi.fn(),
  getMedia: vi.fn(),
}));

function makeRecord(overrides: Partial<PracticeRecord> = {}): PracticeRecord {
  return {
    id: 'rec-1',
    mediaId: 'media-1',
    mediaTitle: 'Lesson 1',
    mediaFilename: 'lesson-1.mp3',
    mode: 'shadowing',
    mimeType: 'audio/webm;codecs=opus',
    createdAt: 1_704_067_200_000,
    sourceDuration: 120,
    recordingDuration: 110,
    segments: [],
    ...overrides,
  };
}

describe('formatRecordingFileName', () => {
  it('uses title and mime extension when provided', () => {
    const name = formatRecordingFileName(makeRecord(), 'My Lesson');
    expect(name).toMatch(/^shadowing-My Lesson-/);
    expect(name).toMatch(/\.webm$/);
  });

  it('falls back to mediaId when title is omitted', () => {
    const name = formatRecordingFileName(makeRecord({ mediaId: 'abc-123' }));
    expect(name).toMatch(/^shadowing-abc-123-/);
  });
});

describe('downloadBlob', () => {
  it('creates a temporary anchor and revokes object URL', () => {
    const click = vi.fn();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchor = { href: '', download: '', click } as HTMLAnchorElement;
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    downloadBlob(new Blob(['data']), 'file.webm');

    expect(createObjectURL).toHaveBeenCalled();
    expect(anchor.download).toBe('file.webm');
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    createElement.mockRestore();
  });
});

describe('exportRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when recording blob is missing', async () => {
    const { getRecordingBlob } = await import('../db/service.js');
    vi.mocked(getRecordingBlob).mockResolvedValue(undefined);

    const { exportRecording } = await import('./export-content.js');
    await expect(exportRecording(makeRecord())).rejects.toThrow('录音文件未找到');
  });
});

describe('estimateStorage', () => {
  it('returns defaults when storage API is unavailable', async () => {
    const original = navigator.storage;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: undefined,
    });

    await expect(estimateStorage()).resolves.toEqual({
      usage: 0,
      quota: 0,
      remaining: 0,
      remainingPercent: 100,
    });

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: original,
    });
  });

  it('caps quota by app settings', async () => {
    const estimate = vi.fn().mockResolvedValue({ usage: 1024, quota: 1024 * 1024 * 1024 });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate },
    });

    const result = await estimateStorage();
    expect(result.usage).toBe(1024);
    expect(result.quota).toBe(200 * 1024 * 1024);
    expect(result.remaining).toBe(result.quota - 1024);
  });
});
