import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';

vi.mock('./file-validation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./file-validation.js')>();
  return {
    ...actual,
    getMediaDuration: vi.fn().mockResolvedValue(12.5),
    hashAny: vi.fn(async (value: string) => `hash-${value}`),
  };
});

function makeFile(name: string, type: string, content = 'data'): File {
  return new File([content], name, { type });
}

const validSrt = `1
00:00:00,000 --> 00:00:02,000
Hello

2
00:00:02,000 --> 00:00:04,000
World
`;

describe('importContentFiles', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
  });

  it('rejects unsupported file types', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([makeFile('notes.txt', 'text/plain')]);

    expect(result.imported).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.filename).toBe('notes.txt');
  });

  it('reports duplicate audio files in the same group', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg'),
      makeFile('lesson.wav', 'audio/wav'),
    ]);

    expect(result.imported).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.filename).toBe('lesson.wav');
  });

  it('imports audio and matching srt subtitle', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg'),
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(2);
    expect(
      result.imported.some((item) => 'mimeType' in item && item.filename === 'lesson.mp3'),
    ).toBe(true);
    expect(result.imported.some((item) => 'type' in item && item.type === 'srt')).toBe(true);
  });

  it('imports subtitle-only and links existing media by title', async () => {
    const { addMedia } = await import('../db/media.js');
    const item = {
      id: 'media-1',
      title: 'lesson',
      filename: 'lesson.mp3',
      size: 10,
      type: 'audio' as const,
      mimeType: 'audio/mpeg',
      duration: 10,
      createdAt: 1,
      hasSubtitles: false,
    };
    await addMedia(item, { mediaId: item.id, blob: new Blob(['audio'], { type: 'audio/mpeg' }) });

    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(1);

    const { getMedia } = await import('../db/media.js');
    expect((await getMedia(item.id))?.hasSubtitles).toBe(true);
  });
});
