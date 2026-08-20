import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import { addMedia, deleteMedia } from './media.js';
import {
  deleteReferenceProsodyProfilesByMediaId,
  getReferenceProsodyProfile,
  putReferenceProsodyProfile,
  referenceProsodyProfileId,
} from './reference-prosody-profile.js';
import type { ReferenceProsodyProfile } from '../types/models.js';

const profile: ReferenceProsodyProfile = {
  version: '1',
  profile_hash: 'abc',
  reference_duration_sec: 2,
  language: 'en',
  reference_text: 'hello',
  speech_span_sec: 1.5,
  words: [],
  f0_contour: [0.1],
  energy_contour: [0.2],
};

describe('reference-prosody-profile db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('puts and gets a profile by mediaId and segmentId', async () => {
    const stored = await putReferenceProsodyProfile('media-1', 'seg-a', profile);

    expect(stored.id).toBe(referenceProsodyProfileId('media-1', 'seg-a'));
    expect(await getReferenceProsodyProfile('media-1', 'seg-a')).toEqual(stored);
  });

  it('clears profiles for a mediaId', async () => {
    await putReferenceProsodyProfile('media-1', 'seg-a', profile);
    await putReferenceProsodyProfile('media-1', 'seg-b', profile);
    await putReferenceProsodyProfile('media-2', 'seg-a', profile);

    await deleteReferenceProsodyProfilesByMediaId('media-1');

    expect(await getReferenceProsodyProfile('media-1', 'seg-a')).toBeUndefined();
    expect(await getReferenceProsodyProfile('media-1', 'seg-b')).toBeUndefined();
    expect(await getReferenceProsodyProfile('media-2', 'seg-a')).toBeDefined();
  });

  it('deleteMedia clears profiles for that media', async () => {
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
    await putReferenceProsodyProfile('media-1', 'seg-a', profile);

    await deleteMedia('media-1');

    expect(await getReferenceProsodyProfile('media-1', 'seg-a')).toBeUndefined();
  });
});
