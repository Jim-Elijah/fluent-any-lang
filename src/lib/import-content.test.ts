import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import { hashFile } from './file-validation.js';

vi.mock('./file-validation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./file-validation.js')>();
  return {
    ...actual,
    getMediaDuration: vi.fn().mockResolvedValue(12.5),
    hashAny: vi.fn(async (value: string | File) =>
      typeof value === 'string' ? `hash-${value}` : `hash-file-${value.name}`,
    ),
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

  it('groups audio and video with the same basename separately by type', async () => {
    const { groupFiles } = await import('./import-content.js');
    const { groups, errors } = groupFiles([
      makeFile('lesson.mp3', 'audio/mpeg'),
      makeFile('lesson.mp4', 'video/mp4'),
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    expect(errors).toHaveLength(0);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.audio?.name).toBe('lesson.mp3');
    expect(groups[0]?.video?.name).toBe('lesson.mp4');
    expect(groups[0]?.srt?.name).toBe('lesson.srt');
  });

  it('imports video and matching srt subtitle', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([
      makeFile('lesson.mp4', 'video/mp4'),
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    expect(result.errors).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.imported).toHaveLength(2);
    expect(
      result.imported.some(
        (item) => 'mimeType' in item && item.filename === 'lesson.mp4' && item.type === 'video',
      ),
    ).toBe(true);
    expect(
      result.imported.some(
        (item) => 'segments' in item && item.type === 'srt' && item.mediaId === 'hash-lesson.mp4',
      ),
    ).toBe(true);
  });

  it('imports audio and matching srt subtitle', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg'),
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    expect(result.errors).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.imported).toHaveLength(2);
    expect(
      result.imported.some((item) => 'mimeType' in item && item.filename === 'lesson.mp3'),
    ).toBe(true);
    expect(
      result.imported.some(
        (item) => 'segments' in item && item.type === 'srt' && item.mediaId === 'hash-lesson.mp3',
      ),
    ).toBe(true);
  });

  it('imports subtitle-only and links existing media by mediaId', async () => {
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
      contentHash: 'abc',
      hasSubtitles: false,
    };
    await addMedia(item, { mediaId: item.id, blob: new Blob(['audio'], { type: 'audio/mpeg' }) });

    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({ mediaId: 'media-1', type: 'srt' });

    const { getMedia } = await import('../db/media.js');
    expect((await getMedia(item.id))?.hasSubtitles).toBe(true);

    const { getSubtitle } = await import('../db/subtitle.js');
    expect(await getSubtitle('media-1')).toBeTruthy();
  });

  it('skips identical media on re-import', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const file = makeFile('lesson.mp3', 'audio/mpeg', 'same-bytes');

    const first = await importContentFiles([file]);
    expect(first.imported).toHaveLength(1);
    expect(first.skipped).toHaveLength(0);

    const second = await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'same-bytes')]);
    expect(second.imported).toHaveLength(0);
    expect(second.skipped).toHaveLength(1);
    expect(second.conflicts).toHaveLength(0);
  });

  it('skips identical subtitle on re-import via contentHash', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const media = makeFile('lesson.mp3', 'audio/mpeg', 'audio');
    const srt = makeFile('lesson.srt', 'application/x-subrip', validSrt);

    const first = await importContentFiles([media, srt]);
    expect(first.errors).toHaveLength(0);
    expect(first.imported.some((item) => 'segments' in item)).toBe(true);

    const second = await importContentFiles([
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);
    expect(second.imported).toHaveLength(0);
    expect(second.skipped).toHaveLength(1);
    expect(second.conflicts).toHaveLength(0);
    expect(second.skipped[0]?.message).toMatch(/字幕已存在且内容相同/);
  });

  it('reports subtitle-content conflict when subtitle text differs', async () => {
    const { importContentFiles } = await import('./import-content.js');
    await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg', 'audio'),
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    const otherSrt = `1
00:00:00,000 --> 00:00:02,000
Changed

2
00:00:02,000 --> 00:00:04,000
Text
`;
    const result = await importContentFiles([
      makeFile('lesson.srt', 'application/x-subrip', otherSrt),
    ]);
    expect(result.imported).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe('subtitle-content');
  });

  it('defers duration read when same-name media has different size', async () => {
    const { getMediaDuration } = await import('./file-validation.js');
    const { importContentFiles } = await import('./import-content.js');

    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'short')]);
    vi.mocked(getMediaDuration).mockClear();

    const result = await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg', 'much-longer-content-bytes'),
    ]);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe('media-content');
    expect(getMediaDuration).not.toHaveBeenCalled();
  });

  it('reports content conflict when same filename differs', async () => {
    const { importContentFiles } = await import('./import-content.js');

    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'v1')]);
    const result = await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'v2-different')]);

    expect(result.imported).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe('media-content');
  });

  it('overwrites media when overwriteMediaIds is set', async () => {
    const { importContentFiles } = await import('./import-content.js');

    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'v1')]);
    const conflict = await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg', 'v2-different'),
    ]);
    const mediaId = conflict.conflicts[0]!.existingMediaId;

    const result = await importContentFiles(
      [makeFile('lesson.mp3', 'audio/mpeg', 'v2-different')],
      {
        overwriteMediaIds: [mediaId],
      },
    );

    expect(result.conflicts).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    const contentHash = await hashFile(makeFile('lesson.mp3', 'audio/mpeg', 'v2-different'));
    expect(result.imported[0]).toMatchObject({ contentHash, filename: 'lesson.mp3' });
  });

  it('reports title conflict for same-title different extension audio', async () => {
    const { importContentFiles } = await import('./import-content.js');

    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'a')]);
    const result = await importContentFiles([makeFile('lesson.m4a', 'audio/mp4', 'b')]);

    expect(result.imported).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.kind).toBe('media-title');
  });

  it('rejects subtitle-only when no media exists', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    expect(result.imported).toHaveLength(0);
    expect(result.errors[0]?.message).toMatch(/请先导入/);
  });

  it('importSubtitleForMedia attaches subtitle to an existing media id', async () => {
    const { importContentFiles, importSubtitleForMedia } = await import('./import-content.js');
    const { getMedia, getSubtitle } = await import('../db/service.js');

    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg')]);
    const mediaId = 'hash-lesson.mp3';

    const result = await importSubtitleForMedia(
      mediaId,
      makeFile('other-name.srt', 'application/x-subrip', validSrt),
    );

    expect(result.errors).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({
      mediaId,
      type: 'srt',
      filename: 'other-name.srt',
    });
    expect((await getSubtitle(mediaId))?.segments).toHaveLength(2);
    expect((await getMedia(mediaId))?.hasSubtitles).toBe(true);
  });

  it('importSubtitleForMedia rejects missing media and invalid type', async () => {
    const { importContentFiles, importSubtitleForMedia } = await import('./import-content.js');

    const missing = await importSubtitleForMedia(
      'no-such-media',
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    );
    expect(missing.errors[0]?.message).toMatch(/媒体不存在/);

    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg')]);
    const badType = await importSubtitleForMedia(
      'hash-lesson.mp3',
      makeFile('notes.txt', 'text/plain'),
    );
    expect(badType.errors[0]?.message).toMatch(/\.srt 或 \.lrc/);
  });

  it('buildOverwriteOptions maps decisions to overwrite sets', async () => {
    const { buildOverwriteOptions } = await import('./import-content.js');
    const options = buildOverwriteOptions([
      {
        conflict: {
          kind: 'media-content',
          filename: 'a.mp3',
          message: 'x',
          existingMediaId: 'id-1',
        },
        overwrite: true,
      },
      {
        conflict: {
          kind: 'media-title',
          filename: 'b.m4a',
          message: 'x',
          existingMediaId: 'id-2',
          title: 'lesson',
          mediaType: 'audio',
        },
        overwrite: true,
      },
      {
        conflict: {
          kind: 'subtitle-content',
          filename: 'c.srt',
          message: 'x',
          existingMediaId: 'id-3',
        },
        overwrite: false,
      },
    ]);

    expect(options).toEqual({
      overwriteMediaIds: ['id-1'],
      overwriteTitleTypes: ['lesson::audio'],
      overwriteSubtitleMediaIds: [],
    });
  });

  it('buildOverwriteOptions returns null when all skipped', async () => {
    const { buildOverwriteOptions } = await import('./import-content.js');
    expect(
      buildOverwriteOptions([
        {
          conflict: {
            kind: 'media-content',
            filename: 'a.mp3',
            message: 'x',
            existingMediaId: 'id-1',
          },
          overwrite: false,
        },
      ]),
    ).toBeNull();
  });
});
