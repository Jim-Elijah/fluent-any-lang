import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { SubtitleTrack } from '../types/models.js';

function makeSubtitle(overrides: Partial<SubtitleTrack> = {}): SubtitleTrack {
  return {
    id: 'sub-1',
    title: 'Lesson 1',
    filename: 'lesson-1.srt',
    type: 'srt',
    segments: [{ id: 's1', startTime: 0, endTime: 2, text: 'hello' }],
    ...overrides,
  };
}

describe('subtitle db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('adds and retrieves subtitle by title', async () => {
    const { addSubtitle, getSubtitle } = await import('./subtitle.js');
    const track = makeSubtitle();

    await addSubtitle(track);
    expect(await getSubtitle('Lesson 1')).toEqual(track);
  });

  it('deletes subtitle by title', async () => {
    const { addSubtitle, deleteSubtitle, getSubtitle } = await import('./subtitle.js');
    const track = makeSubtitle();

    await addSubtitle(track);
    await deleteSubtitle('Lesson 1');
    expect(await getSubtitle('Lesson 1')).toBeUndefined();
  });

  it('deleteSubtitle is a no-op when title is missing', async () => {
    const { deleteSubtitle } = await import('./subtitle.js');
    await expect(deleteSubtitle('missing')).resolves.toBeUndefined();
  });
});
