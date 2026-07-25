import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoiseItem } from '../types/models.js';

const {
  addNoise,
  getNoise,
  getNoiseByContentHash,
  getNoiseList,
  getMediaDuration,
  hashAny,
  hashFile,
} = vi.hoisted(() => ({
  addNoise: vi.fn(),
  getNoise: vi.fn(),
  getNoiseByContentHash: vi.fn(),
  getNoiseList: vi.fn(),
  getMediaDuration: vi.fn(),
  hashAny: vi.fn(),
  hashFile: vi.fn(),
}));

vi.mock('../db/noise.js', () => ({
  addNoise,
  getNoise,
  getNoiseByContentHash,
  getNoiseList,
}));

vi.mock('./file-validation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./file-validation.js')>();
  return {
    ...actual,
    getMediaDuration,
    hashAny,
    hashFile,
  };
});

import { importNoiseFiles } from './import-noise.js';

function makeAudioFile(name = 'cafe.mp3', content = 'noise-bytes'): File {
  return new File([content], name, { type: 'audio/mpeg' });
}

function makeNoiseItem(overrides: Partial<NoiseItem> = {}): NoiseItem {
  return {
    id: 'noise-id',
    title: 'Cafe',
    filename: 'cafe.mp3',
    size: 11,
    mimeType: 'audio/mpeg',
    duration: 12.5,
    createdAt: 1,
    contentHash: 'content-hash',
    ...overrides,
  };
}

describe('importNoiseFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMediaDuration.mockResolvedValue(12.5);
    hashFile.mockResolvedValue('content-hash');
    hashAny.mockImplementation(async (value: string | File) =>
      typeof value === 'string' ? `id-${value}` : `id-${value.name}`,
    );
    getNoiseByContentHash.mockResolvedValue(undefined);
    getNoise.mockResolvedValue(undefined);
    getNoiseList.mockResolvedValue([]);
    addNoise.mockResolvedValue(undefined);
  });

  it('imports a valid audio noise file', async () => {
    const file = makeAudioFile();
    const result = await importNoiseFiles([file]);

    expect(result.errors).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]?.title).toBe('cafe');
    expect(result.imported[0]?.contentHash).toBe('content-hash');
    expect(addNoise).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'id-cafe.mp3', filename: 'cafe.mp3' }),
      { noiseId: 'id-cafe.mp3', blob: file },
    );
  });

  it('rejects non-audio files', async () => {
    const result = await importNoiseFiles([new File(['x'], 'clip.mp4', { type: 'video/mp4' })]);
    expect(result.imported).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('音频');
  });

  it('rejects unsupported media formats', async () => {
    const result = await importNoiseFiles([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toBeTruthy();
  });

  it('reports duration read failures', async () => {
    getMediaDuration.mockRejectedValueOnce(new Error('bad duration'));
    const result = await importNoiseFiles([makeAudioFile()]);
    expect(result.errors[0]?.message).toBe('bad duration');

    getMediaDuration.mockRejectedValueOnce('boom');
    const result2 = await importNoiseFiles([makeAudioFile('other.mp3')]);
    expect(result2.errors[0]?.message).toContain('时长');
  });

  it('skips when content hash already exists', async () => {
    getNoiseByContentHash.mockResolvedValueOnce(makeNoiseItem());
    const result = await importNoiseFiles([makeAudioFile()]);
    expect(result.skipped).toHaveLength(1);
    expect(result.imported).toEqual([]);
    expect(addNoise).not.toHaveBeenCalled();
  });

  it('skips when same filename id already has identical content', async () => {
    const file = makeAudioFile('cafe.mp3', 'same');
    getNoise.mockResolvedValueOnce(
      makeNoiseItem({
        id: 'id-cafe.mp3',
        size: file.size,
        duration: 12.5,
        contentHash: 'content-hash',
      }),
    );

    const result = await importNoiseFiles([file]);
    expect(result.skipped).toHaveLength(1);
    expect(addNoise).not.toHaveBeenCalled();
  });

  it('uses contentHash as id when filename id collides with different content', async () => {
    const file = makeAudioFile('cafe.mp3', 'new-bytes');
    getNoise.mockResolvedValueOnce(
      makeNoiseItem({
        id: 'id-cafe.mp3',
        size: 999,
        duration: 1,
        contentHash: 'old-hash',
      }),
    );

    const result = await importNoiseFiles([file]);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]?.id).toBe('content-hash');
    expect(addNoise).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'content-hash' }),
      expect.objectContaining({ noiseId: 'content-hash' }),
    );
  });

  it('skips when remapped contentHash id already exists', async () => {
    const file = makeAudioFile('cafe.mp3', 'new-bytes');
    getNoise
      .mockResolvedValueOnce(
        makeNoiseItem({
          id: 'id-cafe.mp3',
          size: 999,
          duration: 1,
          contentHash: 'old-hash',
        }),
      )
      .mockResolvedValueOnce(makeNoiseItem({ id: 'content-hash' }));

    const result = await importNoiseFiles([file]);
    expect(result.skipped).toHaveLength(1);
    expect(addNoise).not.toHaveBeenCalled();
  });

  it('skips when list already contains matching size/duration/hash', async () => {
    const file = makeAudioFile();
    getNoiseList.mockResolvedValueOnce([
      makeNoiseItem({
        id: 'other-id',
        size: file.size,
        duration: 12.5,
        contentHash: 'content-hash',
      }),
    ]);

    const result = await importNoiseFiles([file]);
    expect(result.skipped).toHaveLength(1);
    expect(addNoise).not.toHaveBeenCalled();
  });

  it('captures unexpected thrown errors per file', async () => {
    hashFile.mockRejectedValueOnce(new Error('hash failed'));
    const result = await importNoiseFiles([makeAudioFile()]);
    expect(result.errors[0]?.message).toBe('hash failed');

    hashFile.mockRejectedValueOnce('nope');
    const result2 = await importNoiseFiles([makeAudioFile('b.mp3')]);
    expect(result2.errors[0]?.message).toContain('导入失败');
  });

  it('returns empty buckets for an empty file list', async () => {
    await expect(importNoiseFiles([])).resolves.toEqual({
      imported: [],
      skipped: [],
      errors: [],
    });
  });
});
