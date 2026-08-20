import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../../test/db-helpers.js';
import { setAppSettings } from '../app-settings.js';
import { addMedia } from '../../db/media.js';
import {
  getReferenceProsodyProfile,
  putReferenceProsodyProfile,
} from '../../db/reference-prosody-profile.js';
import { saveRecording } from '../../db/record.js';
import { addSubtitle } from '../../db/subtitle.js';
import { getScoreByRecordId } from '../../db/pronunciation-score.js';
import type {
  PracticeRecord,
  ReferenceProsodyProfile,
  SubtitleTrack,
} from '../../types/models.js';
import { PronunciationScoreHttpError } from './client.js';
import { SCORE_MAX_DURATION_SEC, scoreTooLongMessage } from './constants.js';
import {
  isCachedProfileValid,
  requestScore,
  resolveReferenceDuration,
  resolveReferenceText,
} from './service.js';

vi.mock('./client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client.js')>();
  return {
    ...actual,
    scorePronunciation: vi.fn(),
  };
});

vi.mock('../audio-clip.js', () => ({
  clipAudioBlob: vi.fn(async () => ({
    blob: new Blob(['clipped-ref'], { type: 'audio/wav' }),
    mimeType: 'audio/wav',
    duration: 2,
  })),
}));

import { scorePronunciation } from './client.js';
import { clipAudioBlob } from '../audio-clip.js';

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

const sampleProfile: ReferenceProsodyProfile = {
  version: '1',
  profile_hash: 'hash1',
  reference_duration_sec: 2,
  language: 'en',
  reference_text: 'Hello there',
  speech_span_sec: 1.8,
  words: [],
  f0_contour: [0.5],
  energy_contour: [0.5],
};

function successResponse(overrides: Record<string, unknown> = {}) {
  return {
    accuracy: 80,
    fluency: 70,
    completeness: 90,
    prosody: 84,
    prosody_naturalness: 81,
    prosody_match: 87,
    overall: 81,
    details: {
      transcript: 'Hello there',
      word_scores: [],
      missing_words: [],
      extra_words: [],
      misread_words: [],
      prosody_breakdown: {
        speed: 100,
        rhythm: 85,
        intonation: 78,
        stress: 82,
      },
      reference_prosody_profile: null,
    },
    meta: {
      model: 'whisperx-base',
      device: 'cpu',
      latency_ms: 10,
      reference_source: 'text' as const,
    },
    ...overrides,
  };
}

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

describe('resolveReferenceDuration', () => {
  it('returns single echo segment source duration', () => {
    expect(resolveReferenceDuration(makeRecord())).toBe(2);
  });

  it('sums shadowing segment durations excluding inter-segment gaps', () => {
    const record = makeRecord({
      mode: 'shadowing',
      segmentId: undefined,
      segments: [
        {
          id: 'seg-a',
          sourceStartTime: 0,
          sourceEndTime: 5,
          recordingStartTime: 0,
          recordingEndTime: 5,
        },
        {
          id: 'seg-b',
          sourceStartTime: 12,
          sourceEndTime: 15,
          recordingStartTime: 5,
          recordingEndTime: 8,
        },
      ],
    });
    expect(resolveReferenceDuration(record)).toBe(8);
  });

  it('returns null for empty segments', () => {
    expect(resolveReferenceDuration(makeRecord({ segments: [] }))).toBeNull();
  });
});

describe('isCachedProfileValid', () => {
  it('accepts matching text and duration within tolerance', () => {
    expect(isCachedProfileValid(sampleProfile, 'Hello there', 2.04)).toBe(true);
    expect(isCachedProfileValid(sampleProfile, 'Hello there', 2.06)).toBe(false);
    expect(isCachedProfileValid(sampleProfile, 'Other text', 2)).toBe(false);
  });
});

describe('requestScore', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.mocked(scorePronunciation).mockReset();
    vi.mocked(clipAudioBlob).mockClear();
    await resetDatabase();
    setAppSettings({
      speechScoreApiUrl: 'http://localhost:8000/api/v2/pronunciation/score',
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
    expect(result.message).toBe(scoreTooLongMessage());
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
      return successResponse();
    });

    const statuses: string[] = [];
    const result = await requestScore(record, {
      onStatus: (score) => statuses.push(score.status),
    });

    expect(pendingSeen).toBe(true);
    expect(result.ok).toBe(true);
    expect(statuses).toEqual(['pending', 'success']);
    expect((await getScoreByRecordId(record.id))?.overall).toBe(81);
    expect((await getScoreByRecordId(record.id))?.prosody).toBe(84);
  });

  it('echo with naturalness basis does not send reference audio or profile', async () => {
    const record = makeRecord();
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    await addSubtitle(subtitleTrack);
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
        hasSubtitles: true,
        contentHash: 'h',
      },
      { mediaId: 'media-1', blob: new Blob(['source'], { type: 'audio/mpeg' }) },
    );
    await putReferenceProsodyProfile('media-1', 'seg-a', sampleProfile);
    vi.mocked(scorePronunciation).mockResolvedValue(successResponse());

    await requestScore(record);

    expect(clipAudioBlob).not.toHaveBeenCalled();
    const input = vi.mocked(scorePronunciation).mock.calls[0]?.[0];
    expect(input?.referenceAudio).toBeUndefined();
    expect(input?.referenceProsodyProfile).toBeUndefined();
  });

  it('echo without cache clips media and sends reference_audio', async () => {
    setAppSettings({ speechScoreProsodyBasis: 'match' });
    const record = makeRecord();
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    await addSubtitle(subtitleTrack);
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
        hasSubtitles: true,
        contentHash: 'h',
      },
      { mediaId: 'media-1', blob: new Blob(['source'], { type: 'audio/mpeg' }) },
    );
    vi.mocked(scorePronunciation).mockResolvedValue(
      successResponse({
        details: {
          transcript: 'Hello there',
          word_scores: [],
          missing_words: [],
          extra_words: [],
          misread_words: [],
          reference_prosody_profile: sampleProfile,
        },
      }),
    );

    const result = await requestScore(record);

    expect(result.ok).toBe(true);
    expect(clipAudioBlob).toHaveBeenCalledOnce();
    const clipArgs = vi.mocked(clipAudioBlob).mock.calls[0];
    expect(clipArgs?.[1]).toBe(0);
    expect(clipArgs?.[2]).toBe(2);
    const input = vi.mocked(scorePronunciation).mock.calls[0]?.[0];
    expect(input?.referenceAudio).toBeInstanceOf(Blob);
    expect(input?.referenceAudioRoles).toBe('prosody');
    expect(input?.referenceProsodyProfile).toBeUndefined();
    expect(result.ok && result.score.prosody_match).toBe(87);
    expect(await getReferenceProsodyProfile('media-1', 'seg-a')).toMatchObject({
      mediaId: 'media-1',
      segmentId: 'seg-a',
      profile: sampleProfile,
    });
  });

  it('echo with a valid cache sends the profile instead of audio', async () => {
    setAppSettings({ speechScoreProsodyBasis: 'match' });
    const record = makeRecord();
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    await addSubtitle(subtitleTrack);
    await putReferenceProsodyProfile('media-1', 'seg-a', sampleProfile);
    vi.mocked(scorePronunciation).mockResolvedValue(successResponse());

    await requestScore(record);

    expect(clipAudioBlob).not.toHaveBeenCalled();
    const input = vi.mocked(scorePronunciation).mock.calls[0]?.[0];
    expect(input?.referenceProsodyProfile).toEqual(sampleProfile);
    expect(input?.referenceAudio).toBeUndefined();
  });

  it('echo degrades to text-only when media blob is missing', async () => {
    const record = makeRecord();
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    await addSubtitle(subtitleTrack);
    vi.mocked(scorePronunciation).mockResolvedValue(successResponse());

    await requestScore(record);

    expect(clipAudioBlob).not.toHaveBeenCalled();
    const input = vi.mocked(scorePronunciation).mock.calls[0]?.[0];
    expect(input?.referenceAudio).toBeUndefined();
    expect(input?.referenceProsodyProfile).toBeUndefined();
  });

  it('shadowing never sends reference audio or profile', async () => {
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
      ],
    });
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    await addSubtitle(subtitleTrack);
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
        hasSubtitles: true,
        contentHash: 'h',
      },
      { mediaId: 'media-1', blob: new Blob(['source'], { type: 'audio/mpeg' }) },
    );
    await putReferenceProsodyProfile('media-1', 'seg-a', sampleProfile);
    vi.mocked(scorePronunciation).mockResolvedValue(successResponse());

    await requestScore(record);

    expect(clipAudioBlob).not.toHaveBeenCalled();
    const input = vi.mocked(scorePronunciation).mock.calls[0]?.[0];
    expect(input?.referenceAudio).toBeUndefined();
    expect(input?.referenceProsodyProfile).toBeUndefined();
  });

  it('deletes a cached profile on 422 and does not retry', async () => {
    setAppSettings({ speechScoreProsodyBasis: 'match' });
    const record = makeRecord();
    await saveRecording(record, new Blob(['audio'], { type: 'audio/webm' }));
    await addSubtitle(subtitleTrack);
    await putReferenceProsodyProfile('media-1', 'seg-a', sampleProfile);
    vi.mocked(scorePronunciation).mockRejectedValue(
      new PronunciationScoreHttpError(422, 'invalid', '评分参数无效，请确认参考文本后重试'),
    );

    const result = await requestScore(record);

    expect(result.ok).toBe(false);
    expect(scorePronunciation).toHaveBeenCalledOnce();
    expect(await getReferenceProsodyProfile('media-1', 'seg-a')).toBeUndefined();
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
    vi.mocked(scorePronunciation).mockResolvedValue(successResponse());

    const result = await requestScore(record);

    expect(result.ok).toBe(true);
    expect(scorePronunciation).toHaveBeenCalled();
    const input = vi.mocked(scorePronunciation).mock.calls[0]?.[0];
    expect(input?.referenceText).toBe('Hello there');
    expect(input?.referenceDuration).toBe(2);
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
