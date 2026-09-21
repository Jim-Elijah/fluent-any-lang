import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PracticeRecord, SentenceBankEntry } from '../types/models.js';
import {
  downloadBlob,
  estimateStorage,
  formatRecordingFileName,
  formatSentenceBankFileName,
} from './export-content.js';

const mockGetRecordingBlobsBatch = vi.fn();
const mockGetSentenceBankBlobsBatch = vi.fn();

vi.mock('../db/service.js', () => ({
  getRecordingBlob: vi.fn(),
  getSentenceBankBlob: vi.fn(),
  getMedia: vi.fn(),
}));

vi.mock('../db/record.js', () => ({
  getRecordingBlobsBatch: (...args: unknown[]) => mockGetRecordingBlobsBatch(...args),
}));

vi.mock('../db/sentence-bank.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/sentence-bank.js')>();
  return {
    ...actual,
    getSentenceBankBlobsBatch: (...args: unknown[]) => mockGetSentenceBankBlobsBatch(...args),
  };
});

function makeRecord(overrides: Partial<PracticeRecord> = {}): PracticeRecord {
  return {
    id: 'rec-1',
    mediaId: 'a1b2c3d4e5f67890',
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

function makeEntry(
  overrides: Partial<
    Pick<SentenceBankEntry, 'sourceMediaId' | 'sourceSegmentId' | 'createdAt'>
  > = {},
) {
  return {
    sourceMediaId: 'a1b2c3d4e5f67890',
    sourceSegmentId: 'f0e1d2c3b4a59687',
    createdAt: 1_704_067_200_000,
    ...overrides,
  };
}

describe('formatRecordingFileName', () => {
  it('keeps shadowing title when provided', () => {
    const name = formatRecordingFileName(makeRecord(), 'My Lesson');
    expect(name).toMatch(/^shadowing-My Lesson-/);
    expect(name).toMatch(/\.webm$/);
  });

  it('falls back to short mediaId when title is omitted', () => {
    const name = formatRecordingFileName(makeRecord({ mediaId: 'abc123456789' }));
    expect(name).toMatch(/^shadowing-abc12345-/);
  });

  it('uses echo prefix with short mediaId, segmentId, and date', () => {
    const name = formatRecordingFileName(
      makeRecord({
        mode: 'echo',
        mediaId: 'mediaid012345',
        segmentId: 'segmentid9999',
        mimeType: 'audio/webm',
      }),
    );
    expect(name).toMatch(/^echo-mediaid0-segmenti-/);
    expect(name).toMatch(/\.webm$/);
  });

  it('falls back without segmentId for echo', () => {
    const name = formatRecordingFileName(makeRecord({ mode: 'echo', mediaId: 'mediaid012345' }));
    expect(name).toMatch(/^echo-mediaid0-/);
    expect(name).not.toContain('undefined');
  });
});

describe('formatSentenceBankFileName', () => {
  it('uses sentence prefix with short mediaId, segmentId, and date', () => {
    const name = formatSentenceBankFileName(makeEntry(), 'audio/wav');
    expect(name).toMatch(/^sentence-a1b2c3d4-f0e1d2c3-/);
    expect(name).toMatch(/\.wav$/);
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

describe('exportRecordingsBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns failed count when a blob is missing', async () => {
    mockGetRecordingBlobsBatch.mockResolvedValue(new Map([['rec-1', undefined]]));

    const { exportRecordingsBatch } = await import('./export-content.js');
    const result = await exportRecordingsBatch([makeRecord()]);

    expect(result.failedCount).toBe(1);
    expect(mockGetRecordingBlobsBatch).toHaveBeenCalledWith(['rec-1']);
  });
});

describe('exportSentenceBankEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when sentence bank blob is missing', async () => {
    const { getSentenceBankBlob } = await import('../db/service.js');
    vi.mocked(getSentenceBankBlob).mockResolvedValue(undefined);

    const { exportSentenceBankEntry } = await import('./export-content.js');
    await expect(
      exportSentenceBankEntry({
        id: 'entry-1',
        contentHash: 'hash-1',
        text: 'Hello',
        sourceMediaId: 'media-1',
        sourceSegmentId: 'seg-1',
        sourceStartTime: 0,
        sourceEndTime: 1,
        sourceTitleSnapshot: 'Lesson',
        sourceMediaType: 'audio',
        sourceAvailable: true,
        removed: false,
        createdAt: 1,
      }),
    ).rejects.toThrow('句库音频未找到');
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
