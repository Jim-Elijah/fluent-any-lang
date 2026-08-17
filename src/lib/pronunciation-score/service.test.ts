import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../../test/db-helpers.js';
import { setAppSettings } from '../app-settings.js';
import { saveRecording } from '../../db/record.js';
import { addSubtitle } from '../../db/subtitle.js';
import { getScoreByRecordId } from '../../db/pronunciation-score.js';
import type { PracticeRecord, SubtitleTrack } from '../../types/models.js';
import { PronunciationScoreHttpError } from './client.js';
import { SCORE_MAX_DURATION_SEC, SCORE_TOO_LONG_MESSAGE } from './constants.js';
import { requestScore, resolveReferenceText } from './service.js';

vi.mock('./client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client.js')>();
  return {
    ...actual,
    scorePronunciation: vi.fn(),
  };
});

import { scorePronunciation } from './client.js';

function makeRecord(overrides: Partial<PracticeRecord> = {}): PracticeRecord {
  return {
    id: 'rec-1',
    mediaId: 'media-1',
    mediaTitle: 'Lesson',
    mediaFilename: 'lesson.mp3',
    mode: 'echo',
    segmentId: 'seg-a',
    mimeType: 'audio/webm',
    createdAt: 1,
    sourceDuration: 3,
    recordingDuration: 3,
    segments: [
      {
        id: 'seg-a',
        sourceStartTime: 0,
        sourceEndTime: 2,
        recordingStartTime: 0,
        recordingEndTime: 2,
      },
    ],
    ...overrides,
  };
}

const subtitleTrack: SubtitleTrack = {
  id: 'sub-1',
  mediaId: 'media-1',
  title: 'Lesson',
  filename: 'lesson.srt',
  type: 'srt',
  contentHash: 'hash',
  segments: [
    { id: 'seg-a', startTime: 0, endTime: 2, text: 'Hello there' },
    { id: 'seg-b', startTime: 2, endTime: 4, text: 'How are you' },
  ],
};

describe('resolveReferenceText', () => {
  it('uses the echo Subtitle Segment text', () => {
    expect(resolveReferenceText(makeRecord(), subtitleTrack)).toBe('Hello there');
  });

  it('joins shadowing segment texts in order', () => {
    const record = makeRecord({
      mode: 'shadowing',
      segmentId: undefined,
      segments: [
        {
          id: 'seg-a',
          sourceStartTime: 0,
          sourceEndTime: 2,
          recordingStartTime: 0,
          recordingEndTime: 2,
        },
        {
          id: 'seg-b',
          sourceStartTime: 2,
          sourceEndTime: 4,
          recordingStartTime: 2,
          recordingEndTime: 4,
        },
      ],
    });
    expect(resolveReferenceText(record, subtitleTrack)).toBe('Hello there\nHow are you');
  });

  it('returns null without a matching subtitle', () => {
    expect(resolveReferenceText(makeRecord(), undefined)).toBeNull();
  });

  it('uses the Practice Segment snapshot when the Subtitle Track is gone', () => {
    expect(
      resolveReferenceText(
        makeRecord({
          segments: [
            {
              id: 'seg-a',
              sourceStartTime: 0,
              sourceEndTime: 2,
              recordingStartTime: 0,
              recordingEndTime: 2,
              text: 'Hello there',
            },
          ],
        }),
        undefined,
      ),
    ).toBe('Hello there');
  });

  it('prefers the snapshot over a later Subtitle Track', () => {
    expect(
      resolveReferenceText(
        makeRecord({
          segments: [
            {
              id: 'seg-a',
              sourceStartTime: 0,
              sourceEndTime: 2,
              recordingStartTime: 0,
              recordingEndTime: 2,
              text: 'Practiced line',
            },
          ],
        }),
        subtitleTrack,
      ),
    ).toBe('Practiced line');
  });

  it('joins shadowing snapshots in order without a Subtitle Track', () => {
    const record = makeRecord({
      mode: 'shadowing',
      segmentId: undefined,
      segments: [
        {
          id: 'seg-a',
          sourceStartTime: 0,
          sourceEndTime: 2,
          recordingStartTime: 0,
          recordingEndTime: 2,
          text: 'Hello there',
        },
        {
          id: 'seg-b',
          sourceStartTime: 2,
          sourceEndTime: 4,
          recordingStartTime: 2,
          recordingEndTime: 4,
          text: 'How are you',
        },
      ],
    });
    expect(resolveReferenceText(record, undefined)).toBe('Hello there\nHow are you');
  });
});

describe('requestScore', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.mocked(scorePronunciation).mockReset();
    await resetDatabase();
    setAppSettings({
      speechScoreApiBaseUrl: 'http://localhost:8000',
      speechScoreApiKey: 'key',
      speechScoreLanguage: 'en',
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('rejects recordings longer than the scoring duration limit without calling the API', async () => {
    const record = makeRecord({ recordingDuration: SCORE_MAX_DURATION_SEC + 1 });
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    await addSubtitle(subtitleTrack);

    const result = await requestScore(record);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('validation');
    expect(result.message).toBe(SCORE_TOO_LONG_MESSAGE);
    expect(scorePronunciation).not.toHaveBeenCalled();
    expect((await getScoreByRecordId(record.id))?.status).toBe('failed');
  });

  it('writes pending then success around the API call', async () => {
    const record = makeRecord();
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    await addSubtitle(subtitleTrack);

    let pendingSeen = false;
    vi.mocked(scorePronunciation).mockImplementation(async () => {
      const current = await getScoreByRecordId(record.id);
      pendingSeen = current?.status === 'pending';
      return {
        accuracy: 80,
        fluency: 70,
        completeness: 90,
        prosody: 81,
        overall: 81,
        details: {
          transcript: 'Hello there',
          word_scores: [],
          missing_words: [],
          extra_words: [],
          prosody_breakdown: {
            speed: 100,
            rhythm: 85,
            intonation: 78,
            stress: 82,
          },
        },
        meta: {
          model: 'whisperx-base',
          device: 'cpu',
          latency_ms: 10,
          reference_source: 'text',
        },
      };
    });

    const statuses: string[] = [];
    const result = await requestScore(record, {
      onStatus: (score) => statuses.push(score.status),
    });

    expect(pendingSeen).toBe(true);
    expect(result.ok).toBe(true);
    expect(statuses).toEqual(['pending', 'success']);
    expect((await getScoreByRecordId(record.id))?.overall).toBe(81);
    expect((await getScoreByRecordId(record.id))?.prosody).toBe(81);
  });

  it('scores from the Practice Segment snapshot without a Subtitle Track', async () => {
    const record = makeRecord({
      segments: [
        {
          id: 'seg-a',
          sourceStartTime: 0,
          sourceEndTime: 2,
          recordingStartTime: 0,
          recordingEndTime: 2,
          text: 'Hello there',
        },
      ],
    });
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    vi.mocked(scorePronunciation).mockResolvedValue({
      accuracy: 80,
      fluency: 70,
      completeness: 90,
      prosody: 81,
      overall: 81,
      details: {
        transcript: 'Hello there',
        word_scores: [],
        missing_words: [],
        extra_words: [],
      },
      meta: {
        model: 'whisperx-base',
        device: 'cpu',
        latency_ms: 10,
        reference_source: 'text',
      },
    });

    const result = await requestScore(record);

    expect(result.ok).toBe(true);
    expect(scorePronunciation).toHaveBeenCalled();
    const input = vi.mocked(scorePronunciation).mock.calls[0]?.[0];
    expect(input?.referenceText).toBe('Hello there');
  });

  it('stores failed status when the API returns an error', async () => {
    const record = makeRecord();
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    await addSubtitle(subtitleTrack);
    vi.mocked(scorePronunciation).mockRejectedValue(
      new PronunciationScoreHttpError(429, 'quota', '评分次数已达上限，请稍后再试'),
    );

    const result = await requestScore(record);

    expect(result.ok).toBe(false);
    const stored = await getScoreByRecordId(record.id);
    expect(stored?.status).toBe('failed');
    expect(stored?.errorCode).toBe(429);
  });
});
