import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import { addMedia, deleteMedia } from './media.js';
import {
  getMediaSourceWordAlignment,
  putMediaSourceWordAlignment,
} from './media-source-word-alignment.js';

describe('media-source-word-alignment db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('puts and gets by mediaId', async () => {
    const row = await putMediaSourceWordAlignment({
      mediaId: 'media-1',
      words: [{ word: 'hi', start: 0, end: 0.2 }],
      referenceText: 'hi',
      language: 'en',
      subtitleContentHash: 'hash-a',
    });
    expect(row.id).toBe('media-1');
    expect(await getMediaSourceWordAlignment('media-1')).toEqual(row);
  });

  it('deleteMedia clears media canonical alignment', async () => {
    await addMedia(
      {
        id: 'media-1',
        title: 'Lesson',
        filename: 'lesson.mp3',
        size: 10,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 10,
        createdAt: 1,
        hasSubtitles: false,
        contentHash: 'h',
      },
      { mediaId: 'media-1', blob: new Blob(['x'], { type: 'audio/mpeg' }) },
    );
    await putMediaSourceWordAlignment({
      mediaId: 'media-1',
      words: [],
      referenceText: 'x',
      language: 'en',
      subtitleContentHash: 'hash',
    });

    await deleteMedia('media-1');

    expect(await getMediaSourceWordAlignment('media-1')).toBeUndefined();
  });
});
