import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../../test/db-helpers.js';
import { setAppSettings } from '../app-settings.js';
import { addMedia } from '../../db/media.js';
import { getMediaSourceWordAlignment } from '../../db/media-source-word-alignment.js';
import { getSourceWordAlignment } from '../../db/source-word-alignment.js';
import { addSubtitle } from '../../db/subtitle.js';
import type { PracticeSegment, SubtitleTrack } from '../../types/models.js';
import { ALIGN_MAX_DURATION_SEC } from './constants.js';
import { alignAllPracticeSegments, alignPracticeSegment } from './service.js';

vi.mock('./client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client.js')>();
  return {
    ...actual,
    alignPronunciation: vi.fn(),
  };
});

vi.mock('../audio-clip.js', () => ({
  clipAudioBlob: vi.fn(async () => ({
    blob: new Blob(['clip'], { type: 'audio/wav' }),
    mimeType: 'audio/wav',
    duration: 2,
  })),
}));

import { alignPronunciation } from './client.js';

const subtitleTrack: SubtitleTrack = {
  id: 'sub-1',
  mediaId: 'media-1',
  title: 'Lesson',
  filename: 'lesson.srt',
  type: 'srt',
  contentHash: 'hash-1',
  segments: [
    { id: 'seg-a', startTime: 0, endTime: 2, text: 'Hello' },
    { id: 'seg-b', startTime: 2, endTime: 4, text: 'World' },
  ],
};

function makeSegment(id: string, start: number, end: number): PracticeSegment {
  return {
    id,
    sourceStartTime: start,
    sourceEndTime: end,
    recordingStartTime: start,
    recordingEndTime: end,
    text: subtitleTrack.segments.find((s) => s.id === id)?.text,
  };
}

describe('pronunciation-align service', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(alignPronunciation).mockReset();
    setAppSettings({
      speechAlignApiUrl: 'https://example.com/api/v1/pronunciation/align',
      speechScoreApiKey: 'key',
      speechScoreLanguage: 'en',
    });
  });

  async function seedShortMedia() {
    await addMedia(
      {
        id: 'media-1',
        title: 'Lesson',
        filename: 'lesson.mp3',
        size: 100,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: 30,
        createdAt: 1,
        hasSubtitles: true,
        contentHash: 'media-hash',
      },
      { mediaId: 'media-1', blob: new Blob(['audio-bytes'], { type: 'audio/mpeg' }) },
    );
    await addSubtitle(subtitleTrack);
  }

  it('alignAll uses one HTTP call for eligible media', async () => {
    await seedShortMedia();
    vi.mocked(alignPronunciation).mockResolvedValue({
      reference_text: 'Hello\nWorld',
      words: [
        { word: 'Hello', start: 0.1, end: 0.5 },
        { word: 'World', start: 2.1, end: 2.5 },
      ],
      duration_sec: 4,
      speech_span_sec: 4,
      reference_newline: 'lf',
      meta: { model: 'm', device: 'cpu', latency_ms: 1, language: 'en' },
    });

    const segments = [makeSegment('seg-a', 0, 2), makeSegment('seg-b', 2, 4)];
    const result = await alignAllPracticeSegments({
      mediaId: 'media-1',
      segments,
      subtitleSegments: subtitleTrack.segments,
    });

    expect(result.ok).toBe(true);
    expect(alignPronunciation).toHaveBeenCalledTimes(1);
    expect(await getMediaSourceWordAlignment('media-1')).toBeDefined();
    expect(await getSourceWordAlignment('media-1', 'seg-a')).toBeDefined();
  });

  it('alignAll rejects locally when the subtitle span is too long (no HTTP)', async () => {
    const longSpanTrack: SubtitleTrack = {
      ...subtitleTrack,
      mediaId: 'media-long',
      id: 'sub-long',
      segments: [
        {
          id: 'seg-a',
          startTime: 0,
          endTime: ALIGN_MAX_DURATION_SEC + 1,
          text: 'Hello',
        },
      ],
    };
    await addMedia(
      {
        id: 'media-long',
        title: 'Long',
        filename: 'long.mp3',
        size: 100,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: ALIGN_MAX_DURATION_SEC + 30,
        createdAt: 1,
        hasSubtitles: true,
        contentHash: 'media-hash',
      },
      { mediaId: 'media-long', blob: new Blob(['audio'], { type: 'audio/mpeg' }) },
    );
    await addSubtitle(longSpanTrack);

    const segments = [makeSegment('seg-a', 0, ALIGN_MAX_DURATION_SEC + 1)];
    const result = await alignAllPracticeSegments({
      mediaId: 'media-long',
      segments,
      subtitleSegments: longSpanTrack.segments,
    });

    expect(result.ok).toBe(false);
    expect(alignPronunciation).not.toHaveBeenCalled();
    expect(await getMediaSourceWordAlignment('media-long')).toBeUndefined();
  });

  it('alignAll clips to the subtitle span when the Media file is longer than the limit', async () => {
    const { clipAudioBlob } = await import('../audio-clip.js');
    vi.mocked(clipAudioBlob).mockClear();
    await addMedia(
      {
        id: 'media-long',
        title: 'Long',
        filename: 'long.mp3',
        size: 100,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: ALIGN_MAX_DURATION_SEC + 30,
        createdAt: 1,
        hasSubtitles: true,
        contentHash: 'media-hash',
      },
      { mediaId: 'media-long', blob: new Blob(['audio'], { type: 'audio/mpeg' }) },
    );
    await addSubtitle({ ...subtitleTrack, mediaId: 'media-long', id: 'sub-long' });
    vi.mocked(alignPronunciation).mockResolvedValue({
      reference_text: 'Hello\nWorld',
      words: [
        { word: 'Hello', start: 0.1, end: 0.5 },
        { word: 'World', start: 2.1, end: 2.5 },
      ],
      duration_sec: 4,
      speech_span_sec: 4,
      reference_newline: 'lf',
      meta: { model: 'm', device: 'cpu', latency_ms: 1, language: 'en' },
    });

    const segments = [makeSegment('seg-a', 0, 2), makeSegment('seg-b', 2, 4)];
    const result = await alignAllPracticeSegments({
      mediaId: 'media-long',
      segments,
      subtitleSegments: subtitleTrack.segments,
    });

    expect(result.ok).toBe(true);
    expect(alignPronunciation).toHaveBeenCalledTimes(1);
    const clipArgs = vi.mocked(clipAudioBlob).mock.calls[0];
    expect(clipArgs?.[1]).toBe(0);
    expect(clipArgs?.[2]).toBe(4);
    const mediaRow = await getMediaSourceWordAlignment('media-long');
    expect(mediaRow?.words[0]?.start).toBeCloseTo(0.1);
  });

  it('alignPracticeSegment clips the segment when the Media file is too long', async () => {
    await addMedia(
      {
        id: 'media-long',
        title: 'Long',
        filename: 'long.mp3',
        size: 100,
        type: 'audio',
        mimeType: 'audio/mpeg',
        duration: ALIGN_MAX_DURATION_SEC + 1,
        createdAt: 1,
        hasSubtitles: true,
        contentHash: 'media-hash',
      },
      { mediaId: 'media-long', blob: new Blob(['audio'], { type: 'audio/mpeg' }) },
    );
    await addSubtitle({ ...subtitleTrack, mediaId: 'media-long', id: 'sub-long' });
    vi.mocked(alignPronunciation).mockResolvedValue({
      reference_text: 'Hello',
      words: [{ word: 'Hello', start: 0.1, end: 0.5 }],
      duration_sec: 2,
      speech_span_sec: 2,
      reference_newline: 'lf',
      meta: { model: 'm', device: 'cpu', latency_ms: 1, language: 'en' },
    });

    const result = await alignPracticeSegment({
      mediaId: 'media-long',
      segment: makeSegment('seg-a', 0, 2),
      subtitleSegments: subtitleTrack.segments,
    });

    expect(result.ok).toBe(true);
    expect(alignPronunciation).toHaveBeenCalledTimes(1);
    expect(await getSourceWordAlignment('media-long', 'seg-a')).toBeDefined();
  });

  it('alignAll force re-runs HTTP when valid media canonical exists', async () => {
    await seedShortMedia();
    const { putMediaSourceWordAlignment } = await import('../../db/media-source-word-alignment.js');
    await putMediaSourceWordAlignment({
      mediaId: 'media-1',
      words: [{ word: 'Hello', start: 0.1, end: 0.5 }],
      referenceText: 'Hello\nWorld',
      language: 'en',
      subtitleContentHash: 'hash-1',
    });

    const segments = [makeSegment('seg-a', 0, 2)];
    await alignAllPracticeSegments({
      mediaId: 'media-1',
      segments,
      subtitleSegments: subtitleTrack.segments,
      options: { force: true },
    });

    expect(alignPronunciation).toHaveBeenCalledTimes(1);
  });

  it('alignAll skips HTTP when valid media canonical exists', async () => {
    await seedShortMedia();
    const { putMediaSourceWordAlignment } = await import('../../db/media-source-word-alignment.js');
    await putMediaSourceWordAlignment({
      mediaId: 'media-1',
      words: [{ word: 'Hello', start: 0.1, end: 0.5 }],
      referenceText: 'Hello\nWorld',
      language: 'en',
      subtitleContentHash: 'hash-1',
    });

    const segments = [makeSegment('seg-a', 0, 2)];
    await alignAllPracticeSegments({
      mediaId: 'media-1',
      segments,
      subtitleSegments: subtitleTrack.segments,
    });

    expect(alignPronunciation).not.toHaveBeenCalled();
  });

  it('segment row overrides media projection on skipIfCached', async () => {
    await seedShortMedia();
    const { putMediaSourceWordAlignment } = await import('../../db/media-source-word-alignment.js');
    await putMediaSourceWordAlignment({
      mediaId: 'media-1',
      words: [{ word: 'proj', start: 0.1, end: 0.5 }],
      referenceText: 'Hello\nWorld',
      language: 'en',
      subtitleContentHash: 'hash-1',
    });
    const { putSourceWordAlignment } = await import('../../db/source-word-alignment.js');
    await putSourceWordAlignment({
      mediaId: 'media-1',
      segmentId: 'seg-a',
      words: [{ word: 'override', start: 0.2, end: 0.6 }],
      referenceText: 'Hello',
      language: 'en',
      source: 'segment',
    });

    const result = await alignPracticeSegment({
      mediaId: 'media-1',
      segment: makeSegment('seg-a', 0, 2),
      subtitleSegments: subtitleTrack.segments,
      options: { skipIfCached: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alignment.words[0]?.word).toBe('override');
    }
    expect(alignPronunciation).not.toHaveBeenCalled();
  });
});
