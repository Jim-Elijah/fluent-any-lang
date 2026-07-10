import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { PracticeRecord } from '../types/models.js';

function makeRecord(overrides: Partial<PracticeRecord> = {}): PracticeRecord {
  return {
    id: 'rec-1',
    mediaId: 'media-1',
    mediaTitle: 'Lesson 1',
    mediaFilename: 'lesson-1.mp3',
    mode: 'shadowing',
    mimeType: 'audio/webm',
    createdAt: 100,
    sourceDuration: 120,
    recordingDuration: 110,
    segments: [],
    ...overrides,
  };
}

describe('record db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('saves and retrieves recording with blob', async () => {
    const { saveRecording, getRecordingBlob, getRecordingList } = await import('./record.js');
    const record = makeRecord();
    const blob = new Blob(['audio'], { type: 'audio/webm' });

    await saveRecording(record, blob);

    expect(await getRecordingBlob(record.id)).toBeDefined();
    expect((await getRecordingBlob(record.id))?.type).toBe('audio/webm');
    expect(await getRecordingList()).toEqual([record]);
  });

  it('finds recordings by mediaId', async () => {
    const { saveRecording, findRecordings, countRecording } = await import('./record.js');
    const first = makeRecord({ id: 'rec-1', mediaId: 'media-a', createdAt: 100 });
    const second = makeRecord({ id: 'rec-2', mediaId: 'media-a', createdAt: 200 });
    const other = makeRecord({ id: 'rec-3', mediaId: 'media-b', createdAt: 300 });
    const blob = new Blob(['audio'], { type: 'audio/webm' });

    await saveRecording(first, blob);
    await saveRecording(second, blob);
    await saveRecording(other, blob);

    expect(await findRecordings('media-a').then((items) => items.map((item) => item.id))).toEqual([
      'rec-1',
      'rec-2',
    ]);
    expect(await countRecording('media-a')).toBe(2);
  });

  it('deletes recording and its blob', async () => {
    const { saveRecording, deleteRecording, getRecordingBlob, getRecordingList } =
      await import('./record.js');
    const record = makeRecord();
    const blob = new Blob(['audio'], { type: 'audio/webm' });

    await saveRecording(record, blob);
    await deleteRecording(record.id);

    expect(await getRecordingBlob(record.id)).toBeUndefined();
    expect(await getRecordingList()).toEqual([]);
  });
});
