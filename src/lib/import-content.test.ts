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

const validLrc = `[ti:Test]
[00:01.00]First line
[00:05.50]Second line`;

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

  it('reports duplicate video and subtitle files in the same group', async () => {
    const { groupFiles } = await import('./import-content.js');
    const { groups, errors } = groupFiles([
      makeFile('lesson.mp4', 'video/mp4'),
      makeFile('lesson.mp4', 'video/mp4', 'duplicate'),
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    expect(groups).toHaveLength(1);
    expect(errors.map((error) => error.filename)).toEqual(['lesson.mp4', 'lesson.srt']);
  });

  it('imports lrc subtitles with the matching media group', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg'),
      makeFile('lesson.lrc', 'application/x-subrip', validLrc),
    ]);

    expect(result.errors).toHaveLength(0);
    expect(result.imported.some((item) => 'segments' in item && item.type === 'lrc')).toBe(true);
  });

  it('reports invalid subtitle files and parse warnings', async () => {
    const { importContentFiles } = await import('./import-content.js');
    const emptyResult = await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg'),
      makeFile('lesson.srt', 'application/x-subrip', ''),
    ]);
    expect(emptyResult.errors.some((error) => error.message.includes('未找到有效的字幕条目'))).toBe(
      true,
    );

    const warnedSrt = `1
00:00:01 --> 00:00:02
Broken

2
00:00:03,000 --> 00:00:04,000
Ok`;
    const warnedResult = await importContentFiles([
      makeFile('warned.mp3', 'audio/mpeg'),
      makeFile('warned.srt', 'application/x-subrip', warnedSrt),
    ]);
    expect(warnedResult.errors).toHaveLength(0);
    expect(warnedResult.warnings.length).toBeGreaterThan(0);
    expect(warnedResult.imported.some((item) => 'segments' in item)).toBe(true);
  });

  it('overwrites subtitle content when overwriteSubtitleMediaIds is set', async () => {
    const { importContentFiles } = await import('./import-content.js');
    await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg'),
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);

    const otherSrt = `1
00:00:00,000 --> 00:00:02,000
Changed

2
00:00:02,000 --> 00:00:04,000
Text
`;
    const result = await importContentFiles(
      [makeFile('lesson.srt', 'application/x-subrip', otherSrt)],
      {
        overwriteSubtitleMediaIds: ['hash-lesson.mp3'],
      },
    );
    expect(result.conflicts).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
  });

  it('overwrites same-title media when overwriteTitleTypes is set', async () => {
    const { importContentFiles } = await import('./import-content.js');
    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'v1')]);

    const result = await importContentFiles([makeFile('lesson.m4a', 'audio/mp4', 'v2')], {
      overwriteTitleTypes: ['lesson::audio'],
    });
    expect(result.conflicts).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0]).toMatchObject({ filename: 'lesson.m4a' });
  });

  it('reports duration read failures and invalid media files', async () => {
    const fileValidation = await import('./file-validation.js');
    const { importContentFiles } = await import('./import-content.js');

    vi.mocked(fileValidation.getMediaDuration).mockRejectedValueOnce(new Error('bad metadata'));
    const durationError = await importContentFiles([makeFile('broken.mp3', 'audio/mpeg')]);
    expect(durationError.errors[0]?.message).toMatch(/无法读取媒体时长/);

    vi.spyOn(fileValidation, 'validateMediaFile').mockReturnValueOnce({
      valid: false,
      error: 'bad media',
    });
    const invalid = await importContentFiles([makeFile('bad.mp3', 'audio/mpeg')]);
    expect(invalid.errors[0]?.message).toBe('bad media');
  });

  it('detects same-size different-duration conflicts without hashing', async () => {
    const { getMediaDuration } = await import('./file-validation.js');
    const { importContentFiles } = await import('./import-content.js');

    vi.mocked(getMediaDuration).mockResolvedValueOnce(12.5);
    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'same-size')]);

    vi.mocked(getMediaDuration).mockResolvedValueOnce(20);
    const result = await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'same-size')]);
    expect(result.conflicts[0]?.kind).toBe('media-content');
  });

  it('detects same-size-and-duration hash conflicts and allows overwrite', async () => {
    const { importContentFiles } = await import('./import-content.js');
    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'same-meta')]);

    const conflict = await importContentFiles([
      makeFile('lesson.mp3', 'audio/mpeg', 'same-meta-diff-hash'),
    ]);
    expect(conflict.conflicts[0]?.kind).toBe('media-content');

    const mediaId = conflict.conflicts[0]!.existingMediaId;
    const overwrite = await importContentFiles(
      [makeFile('lesson.mp3', 'audio/mpeg', 'same-meta-diff-hash')],
      { overwriteMediaIds: [mediaId] },
    );
    expect(overwrite.imported).toHaveLength(1);
  });

  it('rejects ambiguous subtitle-only imports when multiple media share a title', async () => {
    const { addMedia } = await import('../db/media.js');
    await addMedia(
      {
        id: 'media-a',
        title: 'lesson',
        filename: 'lesson.mp3',
        size: 10,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 10,
        createdAt: 1,
        contentHash: 'a',
        hasSubtitles: false,
      },
      { mediaId: 'media-a', blob: new Blob(['a'], { type: 'audio/mpeg' }) },
    );
    await addMedia(
      {
        id: 'media-b',
        title: 'lesson',
        filename: 'lesson.wav',
        size: 10,
        type: 'audio',
        mimeType: 'audio/wav',
        duration: 10,
        createdAt: 1,
        contentHash: 'b',
        hasSubtitles: false,
      },
      { mediaId: 'media-b', blob: new Blob(['b'], { type: 'audio/wav' }) },
    );

    const { importContentFiles } = await import('./import-content.js');
    const result = await importContentFiles([
      makeFile('lesson.srt', 'application/x-subrip', validSrt),
    ]);
    expect(result.errors[0]?.message).toMatch(/多个媒体/);
  });

  it('syncs hasSubtitles when importing media that already has subtitles in db', async () => {
    const { addMedia, addSubtitle, getMedia } = await import('../db/service.js');
    const mediaId = 'hash-lesson.mp3';
    await addMedia(
      {
        id: mediaId,
        title: 'lesson',
        filename: 'lesson.mp3',
        size: 10,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 12.5,
        createdAt: 1,
        contentHash: 'old',
        hasSubtitles: false,
      },
      { mediaId, blob: new Blob(['audio'], { type: 'audio/mpeg' }) },
    );
    await addSubtitle({
      id: 'sub-1',
      mediaId,
      title: 'lesson',
      filename: 'lesson.srt',
      type: 'srt',
      contentHash: 'sub-hash',
      segments: [{ id: 's1', startTime: 0, endTime: 2, text: 'Hello' }],
    });

    const { importContentFiles } = await import('./import-content.js');
    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg', 'fresh-audio')], {
      overwriteMediaIds: [mediaId],
    });
    expect((await getMedia(mediaId))?.hasSubtitles).toBe(true);
  });

  it('importSubtitleForMedia supports overwrite, warnings, and empty segments', async () => {
    const { importContentFiles, importSubtitleForMedia } = await import('./import-content.js');
    await importContentFiles([makeFile('lesson.mp3', 'audio/mpeg')]);
    const mediaId = 'hash-lesson.mp3';

    const warned = await importSubtitleForMedia(
      mediaId,
      makeFile('warn.srt', 'application/x-subrip', validSrt),
    );
    expect(warned.imported).toHaveLength(1);

    const changedSrt = `1
00:00:00,000 --> 00:00:03,000
Changed text
`;
    const overwrite = await importSubtitleForMedia(
      mediaId,
      makeFile('changed.srt', 'application/x-subrip', changedSrt),
      { overwrite: true },
    );
    expect(overwrite.imported).toHaveLength(1);

    const empty = await importSubtitleForMedia(
      mediaId,
      makeFile('empty.srt', 'application/x-subrip', ''),
    );
    expect(empty.errors[0]?.message).toMatch(/未找到有效的字幕条目/);
  });

  it('updates hasSubtitles on existing media when subtitle is imported separately', async () => {
    const { addMedia, getMedia } = await import('../db/service.js');
    const mediaId = 'hash-lesson.mp3';
    await addMedia(
      {
        id: mediaId,
        title: 'lesson',
        filename: 'lesson.mp3',
        size: 10,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 12.5,
        createdAt: 1,
        contentHash: 'existing',
        hasSubtitles: false,
      },
      { mediaId, blob: new Blob(['audio'], { type: 'audio/mpeg' }) },
    );

    const { importContentFiles } = await import('./import-content.js');
    await importContentFiles([makeFile('lesson.srt', 'application/x-subrip', validSrt)]);
    expect((await getMedia(mediaId))?.hasSubtitles).toBe(true);
  });
});
