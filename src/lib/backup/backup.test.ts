import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';

import { buildBackupZip } from './export-backup.js';
import { importBackup, previewBackup } from './import-backup.js';
import { setAppSettings, getAppSettings } from '../app-settings.js';
import { getDB } from '../../db/index.js';
import {
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_PRACTICE_SESSION,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_SUBTITLE,
} from '../../db/schema.js';
import {
  addMedia,
  addMediaToPlaylist,
  addPracticeSession,
  addSubtitle,
  createPlaylist,
  getAllPracticeSessions,
  getMedia,
  getRecording,
  removeMediaFromPlaylist,
  saveRecording,
} from '../../db/service.js';
import type {
  MediaItem,
  Playlist,
  PracticeRecord,
  PracticeSession,
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
});
