import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { SubtitleTrack } from '../types/models.js';

function makeSubtitle(overrides: Partial<SubtitleTrack> = {}): SubtitleTrack {
  return {
    id: 'sub-1',
    mediaId: 'media-1',
    title: 'Lesson 1',
    filename: 'lesson-1.srt',
    type: 'srt',
    contentHash: 'sub-hash',
    segments: [{ id: 's1', startTime: 0, endTime: 2, text: 'hello' }],
    ...overrides,
  };
}

describe('subtitle db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('adds and retrieves subtitle by mediaId', async () => {
    const { addSubtitle, getSubtitle } = await import('./subtitle.js');
    const track = makeSubtitle();

    await addSubtitle(track);
    expect(await getSubtitle('media-1')).toEqual(track);
  });

  it('sets Media.hasSubtitles when adding a Subtitle Track with segments', async () => {
    const { addMedia, getMedia } = await import('./media.js');
    const { addSubtitle } = await import('./subtitle.js');

    await addMedia(
      {
        id: 'media-1',
        title: 'Lesson 1',
        filename: 'lesson-1.mp3',
        size: 10,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 1,
        createdAt: 1,
        contentHash: 'hash',
        hasSubtitles: false,
      },
      { mediaId: 'media-1', blob: new Blob(['a']) },
    );

    await addSubtitle(makeSubtitle());
    expect((await getMedia('media-1'))?.hasSubtitles).toBe(true);
  });

  it('clears Media.hasSubtitles when deleting the Subtitle Track', async () => {
    const { addMedia, getMedia } = await import('./media.js');
    const { addSubtitle, deleteSubtitle } = await import('./subtitle.js');

    await addMedia(
      {
        id: 'media-1',
        title: 'Lesson 1',
        filename: 'lesson-1.mp3',
        size: 10,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 1,
        createdAt: 1,
        contentHash: 'hash',
        hasSubtitles: false,
      },
      { mediaId: 'media-1', blob: new Blob(['a']) },
    );
    await addSubtitle(makeSubtitle());
    await deleteSubtitle('media-1');

    expect((await getMedia('media-1'))?.hasSubtitles).toBe(false);
  });

  it('deletes subtitle by mediaId', async () => {
    const { addSubtitle, deleteSubtitle, getSubtitle } = await import('./subtitle.js');
    const track = makeSubtitle();

    await addSubtitle(track);
    await deleteSubtitle('media-1');
    expect(await getSubtitle('media-1')).toBeUndefined();
  });

  it('deleteSubtitle is a no-op when mediaId is missing', async () => {
    const { deleteSubtitle } = await import('./subtitle.js');
    await expect(deleteSubtitle('missing')).resolves.toBeUndefined();
  });

});
