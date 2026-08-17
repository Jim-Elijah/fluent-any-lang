import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';

import { buildBackupZip, exportBackup } from './export-backup.js';
import { importBackup, previewBackup } from './import-backup.js';
import { setAppSettings, getAppSettings } from '../app-settings.js';
import { getDB } from '../../db/index.js';
import {
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_NOISE,
  STORE_NOISE_BLOB,
  STORE_PRONUNCIATION_SCORE,
  STORE_PRACTICE_SESSION,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_SENTENCE_BANK_BLOB,
  STORE_SUBTITLE,
} from '../../db/schema.js';
import {
  addMedia,
  addMediaToPlaylist,
  addNoise,
  addPracticeSession,
  addSubtitle,
  createPlaylist,
  getAllPracticeSessions,
  getMedia,
  getNoise,
  getRecording,
  getScoreByRecordId,
  getSentenceBankEntry,
  putSentenceBankEntry,
  putPronunciationScore,
  removeMediaFromPlaylist,
  saveRecording,
} from '../../db/service.js';
import type {
  MediaItem,
  Playlist,
  PracticeRecord,
  PracticeSession,
  PronunciationScore,
  SentenceBankEntry,
  SubtitleTrack,
} from '../../types/models.js';
import { STORE_PLAYLIST, STORE_SENTENCE_BANK } from '../../db/schema.js';

async function clearAllStores() {
  const db = await getDB();
  const stores = [
    STORE_MEDIA,
    STORE_MEDIA_BLOB,
    STORE_SUBTITLE,
    STORE_RECORDING,
    STORE_RECORDING_BLOB,
    STORE_PRACTICE_SESSION,
    STORE_PLAYLIST,
    STORE_SENTENCE_BANK,
    STORE_SENTENCE_BANK_BLOB,
    STORE_NOISE,
    STORE_NOISE_BLOB,
    STORE_PRONUNCIATION_SCORE,
  ] as const;
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all(stores.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}

function makeMedia(id = 'media-1'): MediaItem {
  return {
    id,
    title: 'Lesson',
    filename: 'lesson.mp3',
    size: 10,
    type: 'audio',
    mimeType: 'audio/mpeg',
    duration: 12,
    createdAt: 1,
    contentHash: 'hash-media',
    hasSubtitles: true,
  };
}

function makeSubtitle(mediaId = 'media-1'): SubtitleTrack {
  return {
    id: `sub-${mediaId}`,
    mediaId,
    title: 'Lesson',
    filename: 'lesson.srt',
    type: 'srt',
    contentHash: 'hash-sub',
    segments: [{ id: 's1', startTime: 0, endTime: 1, text: 'hi' }],
  };
}

function makeRecord(id = 'rec-1', mediaId = 'media-1'): PracticeRecord {
  return {
    id,
    mediaId,
    mediaTitle: 'Lesson',
    mediaFilename: 'lesson.mp3',
    mode: 'shadowing',
    mimeType: 'audio/webm',
    createdAt: 2,
    sourceDuration: 1,
    recordingDuration: 1,
    segments: [],
  };
}

function makeScore(recordId = 'rec-1'): PronunciationScore {
  return {
    id: `score-${recordId}`,
    recordId,
    status: 'success',
    referenceText: 'hi',
    accuracy: 80,
    fluency: 75,
    completeness: 90,
    prosody: 81,
    overall: 82,
    createdAt: 5,
    scoredAt: 6,
  };
}

function makeSession(id = 'sess-1', mediaId = 'media-1'): PracticeSession {
  return {
    id,
    mediaId,
    mediaTitle: 'Lesson',
    mediaType: 'audio',
    mediaFilename: 'lesson.mp3',
    mode: 'shadowing',
    startedAt: 3,
    endedAt: 4,
    activeMs: 1000,
    dateKey: '2024-01-01',
  };
}

describe('backup export/import', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllStores();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('exports selected categories into a zip with settings', async () => {
    setAppSettings({ maxRecordingsPerMedia: 7, skipRecordingCountdown: true });
    await addMedia(makeMedia(), {
      mediaId: 'media-1',
      blob: new Blob(['abc'], { type: 'audio/mpeg' }),
    });
    await addSubtitle(makeSubtitle());
    await saveRecording(makeRecord(), new Blob(['rec'], { type: 'audio/webm' }));
    await addPracticeSession(makeSession());

    const { blob, manifest } = await buildBackupZip({
      includeMedia: false,
      includeRecordings: true,
      includeSessions: true,
    });

    expect(manifest.flags.includeMedia).toBe(false);
    expect(manifest.counts.recordings).toBe(1);
    expect(manifest.counts.sessions).toBe(1);
    expect(manifest.counts.media).toBe(0);

    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(files['settings.json']).toBeTruthy();
    expect(files['recordings/metadata.jsonl']).toBeTruthy();
    expect(files['sessions/metadata.jsonl']).toBeTruthy();
    expect(files['pronunciation-scores/metadata.jsonl']).toBeTruthy();
    expect(files['media/metadata.jsonl']).toBeUndefined();

    const settings = JSON.parse(strFromU8(files['settings.json']));
    expect(settings.maxRecordingsPerMedia).toBe(7);
    expect(settings.skipRecordingCountdown).toBe(true);
  });

  it('imports backup and skips duplicates', async () => {
    setAppSettings({ maxRecordingsPerMedia: 7 });
    await addMedia(makeMedia(), {
      mediaId: 'media-1',
      blob: new Blob(['abc'], { type: 'audio/mpeg' }),
    });
    await addSubtitle(makeSubtitle());
    await saveRecording(makeRecord(), new Blob(['rec'], { type: 'audio/webm' }));
    await addPracticeSession(makeSession());

    const { blob } = await buildBackupZip({
      includeMedia: true,
      includeRecordings: true,
      includeSessions: true,
    });
    const file = new File([blob], 'backup.zip', { type: 'application/zip' });

    const preview = await previewBackup(file);
    expect(preview.manifest.counts.media).toBe(1);
    expect(preview.settings?.maxRecordingsPerMedia).toBe(7);

    setAppSettings({ maxRecordingsPerMedia: 5 });
    const result = await importBackup(file);
    expect(result.settingsApplied).toBe(true);
    expect(getAppSettings().maxRecordingsPerMedia).toBe(7);
    expect(result.mediaSkipped).toBe(1);
    expect(result.recordingsSkipped).toBe(1);
    expect(result.sessionsSkipped).toBe(1);
    expect(await getMedia('media-1')).toBeTruthy();
    expect(await getRecording('rec-1')).toBeTruthy();
    expect((await getAllPracticeSessions()).length).toBe(1);
  });

  it('round-trips pronunciation scores with recordings in v5 backups', async () => {
    await saveRecording(makeRecord(), new Blob(['rec'], { type: 'audio/webm' }));
    await putPronunciationScore(makeScore());

    const { blob, manifest } = await buildBackupZip({
      includeMedia: false,
      includeRecordings: true,
      includeSessions: false,
      includeSentenceBank: false,
      includeNoise: false,
    });
    expect(manifest.version).toBe(5);
    expect(manifest.flags.includePronunciationScores).toBe(true);
    expect(manifest.counts.pronunciationScores).toBe(1);

    await clearAllStores();
    const result = await importBackup(new File([blob], 'backup.zip', { type: 'application/zip' }));
    expect(result.recordingsImported).toBe(1);
    expect(result.pronunciationScoresImported).toBe(1);
    expect(await getRecording('rec-1')).toBeTruthy();
    expect((await getScoreByRecordId('rec-1'))?.overall).toBe(82);
    expect((await getScoreByRecordId('rec-1'))?.prosody).toBe(81);
  });

  it('rejects unsupported manifest version', async () => {
    const bad = zipSync({
      'manifest.json': strToU8(JSON.stringify({ version: 99, flags: {}, counts: {} })),
    });
    const file = new File([bad], 'bad.zip', { type: 'application/zip' });
    await expect(previewBackup(file)).rejects.toThrow(/不支持的备份格式/);
  });

  it('omits soft-deleted playlist entries and sentence bank entries from export', async () => {
    const media = makeMedia();
    await addMedia(media, {
      mediaId: media.id,
      blob: new Blob(['abc'], { type: 'audio/mpeg' }),
    });

    const playlist = await createPlaylist('Practice');
    await addMediaToPlaylist(playlist.id, media.id);
    await removeMediaFromPlaylist(playlist.id, media.id);

    const db = await getDB();
    const sentenceEntry: SentenceBankEntry = {
      id: 'sentence-1',
      contentHash: 'hash-sentence',
      text: 'hi',
      sourceMediaId: media.id,
      sourceSegmentId: 's1',
      sourceStartTime: 0,
      sourceEndTime: 1,
      sourceTitleSnapshot: media.title,
      sourceMediaType: 'audio',
      sourceAvailable: true,
      removed: true,
      createdAt: 1,
    };
    await db.put(STORE_SENTENCE_BANK, sentenceEntry);

    const storedPlaylist = (await db.get(STORE_PLAYLIST, playlist.id)) as Playlist;
    expect(storedPlaylist.entries.some((entry) => entry.removed)).toBe(true);

    const { blob, manifest } = await buildBackupZip({
      includeMedia: true,
      includeRecordings: false,
      includeSessions: false,
      includeSentenceBank: true,
      includeNoise: false,
    });

    expect(manifest.counts.sentenceBank).toBe(0);

    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const playlists = strFromU8(files['playlists/metadata.jsonl'])
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Playlist);
    const exportedPlaylist = playlists.find((item) => item.id === playlist.id);
    expect(exportedPlaylist?.entries).toEqual([]);

    const sentenceLines = strFromU8(files['sentence-bank/metadata.jsonl'] ?? strToU8(''))
      .split('\n')
      .filter(Boolean);
    expect(sentenceLines).toHaveLength(0);
  });

  it('rejects export when no data categories are selected', async () => {
    await expect(
      buildBackupZip({
        includeMedia: false,
        includeRecordings: false,
        includeSessions: false,
        includeSentenceBank: false,
        includeNoise: false,
      }),
    ).rejects.toThrow('请至少选择一种数据导出');
  });

  it('exports media, sentence bank, and noise blobs then imports into an empty db', async () => {
    const downloadSpy = vi
      .spyOn(await import('../export-content.js'), 'downloadBlob')
      .mockImplementation(() => undefined);

    await addMedia(makeMedia(), {
      mediaId: 'media-1',
      blob: new Blob(['media-bytes'], { type: 'audio/mpeg' }),
    });
    await addSubtitle(makeSubtitle());
    await putSentenceBankEntry(
      {
        id: 'sent-1',
        contentHash: 'hash-sent',
        text: 'Hello',
        sourceMediaId: 'media-1',
        sourceSegmentId: 's1',
        sourceStartTime: 0,
        sourceEndTime: 2,
        sourceTitleSnapshot: 'Lesson',
        sourceMediaType: 'audio',
        sourceAvailable: true,
        removed: false,
        createdAt: 1,
      },
      {
        entryId: 'sent-1',
        blob: new Blob(['clip'], { type: 'audio/wav' }),
        mimeType: 'audio/wav',
        duration: 2,
      },
    );
    await addNoise(
      {
        id: 'noise-1',
        title: 'Cafe',
        filename: 'cafe.mp3',
        size: 4,
        mimeType: 'audio/mpeg',
        duration: 5,
        createdAt: 1,
        contentHash: 'noise-hash',
      },
      { noiseId: 'noise-1', blob: new Blob(['noise'], { type: 'audio/mpeg' }) },
    );

    const createdAt = new Date(2024, 5, 15, 10, 30).getTime();
    vi.spyOn(Date, 'now').mockReturnValue(createdAt);

    const { blob: builtBlob } = await buildBackupZip({
      includeMedia: true,
      includeRecordings: false,
      includeSessions: false,
      includeSentenceBank: true,
      includeNoise: true,
    });

    const manifest = await exportBackup({
      includeMedia: true,
      includeRecordings: false,
      includeSessions: false,
      includeSentenceBank: true,
      includeNoise: true,
    });

    expect(manifest.counts.media).toBe(1);
    expect(manifest.counts.sentenceBank).toBe(1);
    expect(manifest.counts.noise).toBe(1);
    expect(downloadSpy).toHaveBeenCalled();
    const [, filename] = downloadSpy.mock.calls[0]!;
    expect(filename).toBe('fluentanylang-backup-v5-20240615-1030.zip');

    await clearAllStores();

    const file = new File([builtBlob], 'backup.zip', { type: 'application/zip' });
    const result = await importBackup(file);

    expect(result.mediaImported).toBe(1);
    expect(result.subtitlesImported).toBe(1);
    expect(result.sentenceBankImported).toBe(1);
    expect(result.noiseImported).toBe(1);
    expect(result.errors).toEqual([]);
    expect(await getMedia('media-1')).toBeTruthy();

    downloadSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('skips missing blobs and existing playlist/sentence/noise on import', async () => {
    const media = makeMedia();
    await addMedia(media, {
      mediaId: media.id,
      blob: new Blob(['abc'], { type: 'audio/mpeg' }),
    });
    await putSentenceBankEntry(
      {
        id: 'sent-1',
        contentHash: 'hash-sent',
        text: 'Hello',
        sourceMediaId: media.id,
        sourceSegmentId: 's1',
        sourceStartTime: 0,
        sourceEndTime: 2,
        sourceTitleSnapshot: 'Lesson',
        sourceMediaType: 'audio',
        sourceAvailable: true,
        removed: false,
        createdAt: 1,
      },
      {
        entryId: 'sent-1',
        blob: new Blob(['clip'], { type: 'audio/wav' }),
        mimeType: 'audio/wav',
        duration: 2,
      },
    );
    await addNoise(
      {
        id: 'noise-1',
        title: 'Cafe',
        filename: 'cafe.mp3',
        size: 4,
        mimeType: 'audio/mpeg',
        duration: 5,
        createdAt: 1,
        contentHash: 'noise-hash',
      },
      { noiseId: 'noise-1', blob: new Blob(['noise'], { type: 'audio/mpeg' }) },
    );

    const playlist = await createPlaylist('Keep Me');

    const zip = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          version: 2,
          createdAt: 1,
          appVersion: '1.0.0',
          flags: {
            includeMedia: true,
            includeRecordings: true,
            includeSessions: true,
            includeSettings: true,
            includePlaylists: true,
            includeSentenceBank: true,
            includeNoise: true,
          },
          counts: {
            media: 2,
            subtitles: 1,
            recordings: 1,
            sessions: 1,
            playlists: 1,
            sentenceBank: 1,
            noise: 1,
          },
        }),
      ),
      'settings.json': strToU8('{ not-json'),
      'media/metadata.jsonl': strToU8(
        [
          JSON.stringify(media),
          JSON.stringify(makeMedia('media-missing')),
          JSON.stringify({
            ...makeMedia('media-diff-hash'),
            contentHash: 'other-hash',
          }),
        ].join('\n'),
      ),
      [`media/blobs/${media.id}`]: strToU8('abc'),
      [`media/blobs/media-diff-hash`]: strToU8('xyz'),
      'subtitles/metadata.jsonl': strToU8(
        JSON.stringify({
          ...makeSubtitle('media-orphan'),
          id: 'sub-orphan',
          mediaId: 'media-orphan',
        }),
      ),
      'recordings/metadata.jsonl': strToU8(JSON.stringify(makeRecord('rec-missing'))),
      'sessions/metadata.jsonl': strToU8(JSON.stringify(makeSession('sess-new'))),
      'playlists/metadata.jsonl': strToU8(JSON.stringify(playlist)),
      'sentence-bank/metadata.jsonl': strToU8(
        [
          JSON.stringify({
            id: 'sent-1',
            contentHash: 'hash-sent',
            text: 'Hello',
            sourceMediaId: media.id,
            sourceSegmentId: 's1',
            sourceStartTime: 0,
            sourceEndTime: 2,
            sourceTitleSnapshot: 'Lesson',
            sourceMediaType: 'audio',
            sourceAvailable: true,
            removed: false,
            createdAt: 1,
          }),
          JSON.stringify({
            id: 'sent-missing-blob',
            contentHash: 'hash-sent-2',
            text: 'Bye',
            sourceMediaId: media.id,
            sourceSegmentId: 's2',
            sourceStartTime: 0,
            sourceEndTime: 1,
            sourceTitleSnapshot: 'Lesson',
            sourceMediaType: 'audio',
            sourceAvailable: true,
            removed: false,
            createdAt: 1,
          }),
        ].join('\n'),
      ),
      'sentence-bank/blobs/sent-1': strToU8('clip'),
      'noise/metadata.jsonl': strToU8(
        [
          JSON.stringify({
            id: 'noise-1',
            title: 'Cafe',
            filename: 'cafe.mp3',
            size: 4,
            mimeType: 'audio/mpeg',
            duration: 5,
            createdAt: 1,
            contentHash: 'noise-hash',
          }),
          JSON.stringify({
            id: 'noise-missing',
            title: 'Rain',
            filename: 'rain.mp3',
            size: 4,
            mimeType: 'audio/mpeg',
            duration: 5,
            createdAt: 1,
            contentHash: 'noise-hash-2',
          }),
        ].join('\n'),
      ),
      'noise/blobs/noise-1': strToU8('noise'),
    });

    const result = await importBackup(new File([zip], 'partial.zip', { type: 'application/zip' }));

    expect(result.settingsApplied).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.mediaSkipped).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.includes('缺少媒体文件'))).toBe(true);
    expect(result.subtitlesSkipped).toBe(1);
    expect(result.errors.some((e) => e.includes('缺少录音文件'))).toBe(true);
    expect(result.sessionsImported).toBe(1);
    expect(result.playlistsSkipped).toBe(1);
    expect(result.sentenceBankSkipped).toBe(1);
    expect(result.errors.some((e) => e.includes('缺少句库音频'))).toBe(true);
    expect(result.noiseSkipped).toBe(1);
    expect(result.errors.some((e) => e.includes('缺少噪音文件'))).toBe(true);
    expect(await getSentenceBankEntry('sent-1')).toBeTruthy();
    expect(await getNoise('noise-1')).toBeTruthy();
  });

  it('rejects missing or invalid manifest and corrupt zip', async () => {
    const noManifest = zipSync({ 'settings.json': strToU8('{}') });
    await expect(
      previewBackup(new File([noManifest], 'x.zip', { type: 'application/zip' })),
    ).rejects.toThrow('manifest.json');

    const badManifest = zipSync({
      'manifest.json': strToU8(JSON.stringify({ version: 4 })),
    });
    await expect(
      previewBackup(new File([badManifest], 'x.zip', { type: 'application/zip' })),
    ).rejects.toThrow('manifest');

    const notZip = new File([strToU8('not-a-zip')], 'x.zip', { type: 'application/zip' });
    await expect(previewBackup(notZip)).rejects.toThrow('无法打开备份文件');

    await expect(
      importBackup(new File([noManifest], 'x.zip', { type: 'application/zip' })),
    ).rejects.toThrow('manifest.json');
  });

  it('normalizes older manifest versions during preview', async () => {
    const zip = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          version: 1,
          createdAt: 1,
          appVersion: '0.1.0',
          flags: {
            includeMedia: true,
            includeRecordings: false,
            includeSessions: false,
            includeSettings: true,
          },
          counts: { media: 0, subtitles: 0, recordings: 0, sessions: 0 },
        }),
      ),
    });
    const preview = await previewBackup(new File([zip], 'v1.zip', { type: 'application/zip' }));
    expect(preview.manifest.version).toBe(5);
    expect(preview.manifest.flags.includeSentenceBank).toBe(false);
    expect(preview.manifest.counts.noise).toBe(0);
    expect(preview.settings).toBeNull();
  });

  it('skips media with matching content hash and imports subtitles when absent', async () => {
    const media = makeMedia('media-skip');
    await addMedia(media, {
      mediaId: media.id,
      blob: new Blob(['abc'], { type: 'audio/mpeg' }),
    });

    const zip = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          version: 4,
          createdAt: 1,
          appVersion: '1.0.0',
          flags: {
            includeMedia: true,
            includeRecordings: false,
            includeSessions: false,
            includeSettings: false,
            includePlaylists: false,
            includeSentenceBank: false,
            includeNoise: false,
          },
          counts: {
            media: 1,
            subtitles: 1,
            recordings: 0,
            sessions: 0,
            playlists: 0,
            sentenceBank: 0,
            noise: 0,
          },
        }),
      ),
      'media/metadata.jsonl': strToU8(JSON.stringify(media)),
      [`media/blobs/${media.id}`]: strToU8('abc'),
      'subtitles/metadata.jsonl': strToU8(JSON.stringify(makeSubtitle(media.id))),
    });

    const result = await importBackup(new File([zip], 'skip.zip', { type: 'application/zip' }));
    expect(result.mediaSkipped).toBe(1);
    expect(result.subtitlesImported).toBe(1);
  });

  it('records playlist import failures and reads zip via FileReader fallback', async () => {
    const db = await getDB();
    const originalPut = db.put.bind(db);
    vi.spyOn(db, 'put').mockImplementation((store, value) => {
      if (store === STORE_PLAYLIST && (value as Playlist).id === 'pl-1') {
        return Promise.reject(new Error('playlist write failed'));
      }
      return originalPut(store, value);
    });

    const zip = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          version: 4,
          createdAt: 1,
          appVersion: '1.0.0',
          flags: {
            includeMedia: false,
            includeRecordings: false,
            includeSessions: false,
            includeSettings: false,
            includePlaylists: true,
            includeSentenceBank: false,
            includeNoise: false,
          },
          counts: {
            media: 0,
            subtitles: 0,
            recordings: 0,
            sessions: 0,
            playlists: 1,
            sentenceBank: 0,
            noise: 0,
          },
        }),
      ),
      'playlists/metadata.jsonl': strToU8(
        JSON.stringify({
          id: 'pl-1',
          name: 'New',
          createdAt: 1,
          updatedAt: 1,
          mediaIds: [],
        } satisfies Playlist),
      ),
    });

    const file = {
      name: 'playlist-fail.zip',
      type: 'application/zip',
      arrayBuffer: undefined,
    } as unknown as File;
    Object.defineProperty(file, 'arrayBuffer', { value: undefined });
    const readerResult = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (
      this: FileReader,
    ) {
      Object.defineProperty(this, 'result', { value: readerResult });
      this.onload?.({ target: this } as ProgressEvent<FileReader>);
    });

    const result = await importBackup(file);
    expect(result.errors.some((message) => message.includes('playlist write failed'))).toBe(true);
    vi.restoreAllMocks();
  });

  it('records sentence bank and noise import failures', async () => {
    const media = makeMedia('media-import-fail');
    await addMedia(media, {
      mediaId: media.id,
      blob: new Blob(['abc'], { type: 'audio/mpeg' }),
    });

    const service = await import('../../db/service.js');
    const sentenceSpy = vi
      .spyOn(service, 'putSentenceBankEntry')
      .mockRejectedValueOnce(new Error('sentence failed'));
    const noiseSpy = vi.spyOn(service, 'addNoise').mockRejectedValueOnce(new Error('noise failed'));

    const zip = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          version: 4,
          createdAt: 1,
          appVersion: '1.0.0',
          flags: {
            includeMedia: false,
            includeRecordings: false,
            includeSessions: false,
            includeSettings: false,
            includePlaylists: false,
            includeSentenceBank: true,
            includeNoise: true,
          },
          counts: {
            media: 0,
            subtitles: 0,
            recordings: 0,
            sessions: 0,
            playlists: 0,
            sentenceBank: 1,
            noise: 1,
          },
        }),
      ),
      'sentence-bank/metadata.jsonl': strToU8(
        JSON.stringify({
          id: 'sent-new',
          contentHash: 'hash-sent-new',
          text: 'Hello',
          sourceMediaId: media.id,
          sourceSegmentId: 's1',
          sourceStartTime: 0,
          sourceEndTime: 2,
          sourceTitleSnapshot: 'Lesson',
          sourceMediaType: 'audio',
          sourceAvailable: true,
          removed: false,
          createdAt: 1,
        } satisfies SentenceBankEntry),
      ),
      'sentence-bank/blobs/sent-new': strToU8('clip'),
      'noise/metadata.jsonl': strToU8(
        JSON.stringify({
          id: 'noise-new',
          title: 'Rain',
          filename: 'rain.mp3',
          size: 4,
          mimeType: 'audio/mpeg',
          duration: 5,
          createdAt: 1,
          contentHash: 'noise-hash-new',
        }),
      ),
      'noise/blobs/noise-new': strToU8('noise'),
    });

    const result = await importBackup(new File([zip], 'failures.zip', { type: 'application/zip' }));
    expect(result.errors).toEqual(expect.arrayContaining(['sentence failed', 'noise failed']));
    sentenceSpy.mockRestore();
    noiseSpy.mockRestore();
  });

  it('records subtitle, recording, and session import failures', async () => {
    const service = await import('../../db/service.js');
    const subtitleSpy = vi
      .spyOn(service, 'addSubtitle')
      .mockRejectedValueOnce(new Error('subtitle failed'));
    const recordingSpy = vi
      .spyOn(service, 'saveRecording')
      .mockRejectedValueOnce(new Error('recording failed'));
    const sessionSpy = vi
      .spyOn(service, 'addPracticeSession')
      .mockRejectedValueOnce(new Error('session failed'));

    const media = makeMedia('media-error');
    const zip = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          version: 4,
          createdAt: 1,
          appVersion: '1.0.0',
          flags: {
            includeMedia: true,
            includeRecordings: true,
            includeSessions: true,
            includeSettings: false,
            includePlaylists: false,
            includeSentenceBank: false,
            includeNoise: false,
          },
          counts: {
            media: 1,
            subtitles: 1,
            recordings: 1,
            sessions: 1,
            playlists: 0,
            sentenceBank: 0,
            noise: 0,
          },
        }),
      ),
      'media/metadata.jsonl': strToU8(JSON.stringify(media)),
      [`media/blobs/${media.id}`]: strToU8('abc'),
      'subtitles/metadata.jsonl': strToU8(JSON.stringify(makeSubtitle(media.id))),
      'recordings/metadata.jsonl': strToU8(JSON.stringify(makeRecord('rec-fail', media.id))),
      'sessions/metadata.jsonl': strToU8(JSON.stringify(makeSession('sess-fail', media.id))),
      'recordings/blobs/rec-fail': strToU8('rec'),
    });

    const result = await importBackup(new File([zip], 'errors.zip', { type: 'application/zip' }));
    expect(result.errors).toEqual(
      expect.arrayContaining(['subtitle failed', 'recording failed', 'session failed']),
    );
    subtitleSpy.mockRestore();
    recordingSpy.mockRestore();
    sessionSpy.mockRestore();
  });
});
