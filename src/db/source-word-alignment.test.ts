import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import { addMedia, deleteMedia } from './media.js';
import {
  getSourceWordAlignment,
  putSourceWordAlignment,
  sourceWordAlignmentId,
} from './source-word-alignment.js';

describe('source-word-alignment db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('puts and gets by mediaId and segmentId', async () => {
    const stored = await putSourceWordAlignment({
      mediaId: 'media-1',
      segmentId: 'seg-a',
      words: [{ word: 'hi', start: 1.1, end: 1.4 }],
      referenceText: 'hi',
      language: 'en',
      source: 'segment',
    });

    expect(stored?.id).toBe(sourceWordAlignmentId('media-1', 'seg-a'));
    expect(await getSourceWordAlignment('media-1', 'seg-a')).toEqual(stored);
  });

  it('does not let batch overwrite a segment row', async () => {
    await putSourceWordAlignment({
      mediaId: 'media-1',
      segmentId: 'seg-a',
      words: [{ word: 'a', start: 0, end: 0.2 }],
      referenceText: 'a',
      language: 'en',
      source: 'segment',
    });

    const afterBatch = await putSourceWordAlignment({
      mediaId: 'media-1',
      segmentId: 'seg-a',
      words: [{ word: 'b', start: 0, end: 0.3 }],
      referenceText: 'b',
      language: 'en',
      source: 'batch',
    });

    expect(afterBatch?.words[0]?.word).toBe('a');
    expect(afterBatch?.source).toBe('segment');
  });

  it('deleteMedia clears alignments for that media', async () => {
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
    await putSourceWordAlignment({
      mediaId: 'media-1',
      segmentId: 'seg-a',
      words: [],
      referenceText: 'x',
      language: 'en',
      source: 'batch',
    });

    await deleteMedia('media-1');

    expect(await getSourceWordAlignment('media-1', 'seg-a')).toBeUndefined();
  });
});
