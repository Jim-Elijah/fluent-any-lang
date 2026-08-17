import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { PracticeRecord, PronunciationScore } from '../types/models.js';

function makeRecord(overrides: Partial<PracticeRecord> = {}): PracticeRecord {
  return {
    id: 'rec-1',
    mediaId: 'media-1',
    mediaTitle: 'Lesson 1',
    mediaFilename: 'lesson-1.mp3',
    mode: 'echo',
    segmentId: 'seg-1',
    mimeType: 'audio/webm',
    createdAt: 100,
    sourceDuration: 4,
    recordingDuration: 4,
    segments: [],
    ...overrides,
  };
}

function makeScore(overrides: Partial<PronunciationScore> = {}): PronunciationScore {
  return {
    id: 'score-1',
    recordId: 'rec-1',
    status: 'success',
    referenceText: 'hello',
    overall: 84,
    createdAt: 200,
    ...overrides,
  };
}

describe('pronunciation-score db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('puts and reads a score by record id', async () => {
    const { putPronunciationScore, getScoreByRecordId, getPronunciationScore } =
      await import('./pronunciation-score.js');
    const score = makeScore();

    await putPronunciationScore(score);

    expect(await getPronunciationScore(score.id)).toEqual(score);
    expect(await getScoreByRecordId('rec-1')).toEqual(score);
  });

  it('looks up scores by record ids', async () => {
    const { putPronunciationScore, getScoresByRecordIds } =
      await import('./pronunciation-score.js');
    await putPronunciationScore(makeScore({ id: 's1', recordId: 'rec-1', overall: 70 }));
    await putPronunciationScore(makeScore({ id: 's2', recordId: 'rec-2', overall: 90 }));

    const map = await getScoresByRecordIds(['rec-2', 'rec-missing']);
    expect(map.size).toBe(1);
    expect(map.get('rec-2')?.overall).toBe(90);
  });

  it('deletes the score when deleting the recording', async () => {
    const { saveRecording, deleteRecording } = await import('./record.js');
    const { putPronunciationScore, getScoreByRecordId } = await import('./pronunciation-score.js');

    await saveRecording(makeRecord(), new Blob(['audio'], { type: 'audio/webm' }));
    await putPronunciationScore(makeScore());

    expect(await getScoreByRecordId('rec-1')).toBeDefined();
    await deleteRecording('rec-1');
    expect(await getScoreByRecordId('rec-1')).toBeUndefined();
  });
});
