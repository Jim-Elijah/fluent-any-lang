import { unzipSync, strFromU8 } from 'fflate';
import { msg, str } from '@lit/localize';

import { normalizeAppSettings, setAppSettings } from '../app-settings.js';
import {
  addMedia,
  addNoise,
  addPracticeSession,
  addSubtitle,
  ensureFavoritesPlaylist,
  getMedia,
  getNoise,
  getPlaylist,
  getPracticeSession,
  getRecording,
  getSentenceBankEntry,
  getSubtitle,
  getSubtitleById,
  putSentenceBankEntry,
  saveRecording,
} from '../../db/service.js';
import type {
  MediaItem,
  NoiseItem,
  Playlist,
  PracticeRecord,
  PracticeSession,
  SentenceBankEntry,
  SubtitleTrack,
} from '../../types/models.js';
import { type BackupImportResult, type BackupManifest, type BackupPreview } from './types.js';
import { getDB } from '../../db/index.js';
import { STORE_PLAYLIST } from '../../db/schema.js';

type ZipFiles = Record<string, Uint8Array>;

function parseJsonl<T>(text: string): T[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: T[] = [];
  for (const line of lines) {
    rows.push(JSON.parse(line) as T);
  }
  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseManifest(raw: unknown): BackupManifest {
  if (!isRecord(raw)) {
    throw new Error(msg('备份文件损坏：manifest 无效'));
  }

  // Accept v1–v4.
  const version = raw.version as number;
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4) {
    throw new Error(msg('不支持的备份格式，请升级应用后再试'));
  }

  if (!isRecord(raw.flags) || !isRecord(raw.counts)) {
    throw new Error(msg('备份文件损坏：manifest 无效'));
  }

  // Normalize older manifests to v4 shape.
  return {
    ...raw,
    version: 4,
    flags: {
      ...raw.flags,
      includePlaylists: (raw.flags as { includePlaylists?: boolean }).includePlaylists ?? false,
      includeSentenceBank:
        (raw.flags as { includeSentenceBank?: boolean }).includeSentenceBank ?? false,
      includeNoise: (raw.flags as { includeNoise?: boolean }).includeNoise ?? false,
    },
    counts: {
      ...raw.counts,
      playlists: (raw.counts as { playlists?: number }).playlists ?? 0,
      sentenceBank: (raw.counts as { sentenceBank?: number }).sentenceBank ?? 0,
      noise: (raw.counts as { noise?: number }).noise ?? 0,
    },
  } as BackupManifest;
}

function readText(files: ZipFiles, path: string): string | null {
  const data = files[path];
  if (!data) return null;
  return strFromU8(data);
}

function readJsonl<T>(files: ZipFiles, path: string): T[] {
  const text = readText(files, path);
  if (!text) return [];
  return parseJsonl<T>(text);
}

async function unzipFile(file: File): Promise<ZipFiles> {
  let buffer: Uint8Array;
  if (typeof file.arrayBuffer === 'function') {
    buffer = new Uint8Array(await file.arrayBuffer());
  } else {
    buffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error ?? new Error(msg('无法读取文件')));
      reader.readAsArrayBuffer(file);
    });
  }
  try {
    return unzipSync(buffer);
  } catch {
    throw new Error(msg('无法打开备份文件，请确认是有效的 ZIP'));
  }
}

function uint8ToBlob(data: Uint8Array, mimeType = 'application/octet-stream'): Blob {
  // Copy into a fresh ArrayBuffer — Uint8Array may be a view on a SharedArrayBuffer.
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy.buffer], { type: mimeType });
}

export async function previewBackup(file: File): Promise<BackupPreview> {
  const files = await unzipFile(file);
  const manifestText = readText(files, 'manifest.json');
  if (!manifestText) {
    throw new Error(msg('备份文件缺少 manifest.json'));
  }
  const manifest = parseManifest(JSON.parse(manifestText));

  const settingsText = readText(files, 'settings.json');
  const settings = settingsText ? normalizeAppSettings(JSON.parse(settingsText)) : null;

  return {
    manifest,
    settings,
    hasMediaBlobs: Boolean(files['media/metadata.jsonl']),
    hasRecordings: Boolean(files['recordings/metadata.jsonl']),
    hasSessions: Boolean(files['sessions/metadata.jsonl']),
    hasSentenceBank: Boolean(files['sentence-bank/metadata.jsonl']),
    hasNoise: Boolean(files['noise/metadata.jsonl']),
  };
}

export async function importBackup(file: File): Promise<BackupImportResult> {
  const files = await unzipFile(file);
  const manifestText = readText(files, 'manifest.json');
  if (!manifestText) {
    throw new Error(msg('备份文件缺少 manifest.json'));
  }
  parseManifest(JSON.parse(manifestText));

  const result: BackupImportResult = {
    settingsApplied: false,
    mediaImported: 0,
    mediaSkipped: 0,
    subtitlesImported: 0,
    subtitlesSkipped: 0,
    recordingsImported: 0,
    recordingsSkipped: 0,
    sessionsImported: 0,
    sessionsSkipped: 0,
    sentenceBankImported: 0,
    sentenceBankSkipped: 0,
    noiseImported: 0,
    noiseSkipped: 0,
    errors: [],
  };

  const settingsText = readText(files, 'settings.json');
  if (settingsText) {
    try {
      setAppSettings(normalizeAppSettings(JSON.parse(settingsText)));
      result.settingsApplied = true;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : msg('导入设置失败'));
    }
  }

  const mediaItems = readJsonl<MediaItem>(files, 'media/metadata.jsonl');
  for (const item of mediaItems) {
    try {
      const existing = await getMedia(item.id);
      if (existing) {
        if (existing.contentHash && item.contentHash && existing.contentHash === item.contentHash) {
          result.mediaSkipped += 1;
          continue;
        }
        result.mediaSkipped += 1;
        continue;
      }
      const blobData = files[`media/blobs/${item.id}`];
      if (!blobData) {
        result.errors.push(msg(str`缺少媒体文件：${item.filename || item.id}`));
        continue;
      }
      await addMedia(item, {
        mediaId: item.id,
        blob: uint8ToBlob(blobData, item.mimeType || 'application/octet-stream'),
      });
      result.mediaImported += 1;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : msg(str`导入媒体失败：${item.id}`),
      );
    }
  }

  const subtitles = readJsonl<SubtitleTrack>(files, 'subtitles/metadata.jsonl');
  for (const track of subtitles) {
    try {
      const existingById = await getSubtitleById(track.id);
      const existingByMedia = await getSubtitle(track.mediaId);
      if (existingById || existingByMedia) {
        result.subtitlesSkipped += 1;
        continue;
      }
      const media = await getMedia(track.mediaId);
      if (!media) {
        result.subtitlesSkipped += 1;
        continue;
      }
      await addSubtitle(track);
      result.subtitlesImported += 1;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : msg(str`导入字幕失败：${track.id}`),
      );
    }
  }

  const recordings = readJsonl<PracticeRecord>(files, 'recordings/metadata.jsonl');
  for (const record of recordings) {
    try {
      const existing = await getRecording(record.id);
      if (existing) {
        result.recordingsSkipped += 1;
        continue;
      }
      const blobData = files[`recordings/blobs/${record.id}`];
      if (!blobData) {
        result.errors.push(msg(str`缺少录音文件：${record.id}`));
        continue;
      }
      await saveRecording(record, uint8ToBlob(blobData, record.mimeType || 'audio/webm'));
      result.recordingsImported += 1;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : msg(str`导入录音失败：${record.id}`),
      );
    }
  }

  const sessions = readJsonl<PracticeSession>(files, 'sessions/metadata.jsonl');
  for (const session of sessions) {
    try {
      const existing = await getPracticeSession(session.id);
      if (existing) {
        result.sessionsSkipped += 1;
        continue;
      }
      await addPracticeSession(session);
      result.sessionsImported += 1;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : msg(str`导入学习记录失败：${session.id}`),
      );
    }
  }

  // Import playlists (v2 backups only; v1 backups have no playlists).
  const playlistsRaw = readJsonl<Playlist>(files, 'playlists/metadata.jsonl');
  for (const playlist of playlistsRaw) {
    try {
      const existing = await getPlaylist(playlist.id);
      if (existing) {
        // Skip: playlists are user-curated; don't overwrite.
        continue;
      }
      const db = await getDB();
      await db.put(STORE_PLAYLIST, playlist);
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : msg(str`导入播放列表失败：${playlist.id}`),
      );
    }
  }

  // Ensure favorites exists after import (v1 compat or if playlists were empty).
  await ensureFavoritesPlaylist();

  const sentenceBank = readJsonl<SentenceBankEntry>(files, 'sentence-bank/metadata.jsonl');
  for (const entry of sentenceBank) {
    try {
      const existing = await getSentenceBankEntry(entry.id);
      if (existing) {
        result.sentenceBankSkipped += 1;
        continue;
      }
      const blobData = files[`sentence-bank/blobs/${entry.id}`];
      if (!blobData) {
        result.errors.push(msg(str`缺少句库音频：${entry.id}`));
        continue;
      }
      await putSentenceBankEntry(entry, {
        entryId: entry.id,
        blob: uint8ToBlob(blobData, 'audio/wav'),
        mimeType: 'audio/wav',
        duration: Math.max(0, entry.sourceEndTime - entry.sourceStartTime),
      });
      result.sentenceBankImported += 1;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : msg(str`导入句库失败：${entry.id}`),
      );
    }
  }

  const noiseItems = readJsonl<NoiseItem>(files, 'noise/metadata.jsonl');
  for (const item of noiseItems) {
    try {
      const existing = await getNoise(item.id);
      if (existing) {
        result.noiseSkipped += 1;
        continue;
      }
      const blobData = files[`noise/blobs/${item.id}`];
      if (!blobData) {
        result.errors.push(msg(str`缺少噪音文件：${item.filename || item.id}`));
        continue;
      }
      await addNoise(item, {
        noiseId: item.id,
        blob: uint8ToBlob(blobData, item.mimeType || 'audio/mpeg'),
      });
      result.noiseImported += 1;
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : msg(str`导入噪音素材失败：${item.id}`),
      );
    }
  }

  return result;
}
