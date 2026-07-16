import { zipSync, strToU8 } from 'fflate';
import { msg } from '@lit/localize';

import { getAppSettings } from '../app-settings.js';
import { getAppBuildInfo } from '../app-build-info.js';
import { downloadBlob } from '../export-content.js';
import {
  getAllPracticeSessions,
  getAllSubtitles,
  getMediaBlob,
  getMediaList,
  getPlaylistList,
  getRecordingBlob,
  getRecordingList,
} from '../../db/service.js';
import type {
  MediaItem,
  Playlist,
  PracticeRecord,
  PracticeSession,
  SubtitleTrack,
} from '../../types/models.js';
import {
  BACKUP_FORMAT_VERSION,
  DEFAULT_BACKUP_EXPORT_OPTIONS,
  type BackupExportOptions,
  type BackupManifest,
} from './types.js';

function formatBackupFileName(createdAt: number): string {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `fluentanylang-backup-v${BACKUP_FORMAT_VERSION}-${stamp}.zip`;
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  // Response works across Node Blob / happy-dom / browsers more reliably than FileReader.
  const buffer = await new Response(blob).arrayBuffer();
  return new Uint8Array(buffer);
}

function toJsonl(rows: unknown[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

export async function buildBackupZip(
  options: Partial<BackupExportOptions> = {},
): Promise<{ blob: Blob; manifest: BackupManifest }> {
  const opts: BackupExportOptions = { ...DEFAULT_BACKUP_EXPORT_OPTIONS, ...options };
  if (!opts.includeMedia && !opts.includeRecordings && !opts.includeSessions) {
    throw new Error(msg('请至少选择一种数据导出'));
  }

  const createdAt = Date.now();
  const files: Record<string, Uint8Array> = {};

  const settings = getAppSettings();
  files['settings.json'] = strToU8(JSON.stringify(settings, null, 2));

  // Playlists always included in v2.
  const playlists: Playlist[] = await getPlaylistList();
  files['playlists/metadata.jsonl'] = strToU8(toJsonl(playlists));

  let mediaItems: MediaItem[] = [];
  let subtitles: SubtitleTrack[] = [];
  let recordings: PracticeRecord[] = [];
  let sessions: PracticeSession[] = [];

  if (opts.includeMedia) {
    mediaItems = await getMediaList();
    subtitles = await getAllSubtitles();
    files['media/metadata.jsonl'] = strToU8(toJsonl(mediaItems));
    files['subtitles/metadata.jsonl'] = strToU8(toJsonl(subtitles));

    for (const item of mediaItems) {
      const blob = await getMediaBlob(item.id);
      if (!blob) continue;
      files[`media/blobs/${item.id}`] = await blobToUint8Array(blob);
    }
  }

  if (opts.includeRecordings) {
    recordings = await getRecordingList();
    files['recordings/metadata.jsonl'] = strToU8(toJsonl(recordings));
    for (const record of recordings) {
      const blob = await getRecordingBlob(record.id);
      if (!blob) continue;
      files[`recordings/blobs/${record.id}`] = await blobToUint8Array(blob);
    }
  }

  if (opts.includeSessions) {
    sessions = await getAllPracticeSessions();
    files['sessions/metadata.jsonl'] = strToU8(toJsonl(sessions));
  }

  const manifest: BackupManifest = {
    version: BACKUP_FORMAT_VERSION,
    createdAt,
    appVersion: getAppBuildInfo().appVersion,
    flags: {
      includeMedia: opts.includeMedia,
      includeRecordings: opts.includeRecordings,
      includeSessions: opts.includeSessions,
      includeSettings: true,
      includePlaylists: true,
    },
    counts: {
      media: mediaItems.length,
      subtitles: subtitles.length,
      recordings: recordings.length,
      sessions: sessions.length,
      playlists: playlists.length,
    },
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  /** @TODO use async zip */
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: 'application/zip' });
  return { blob, manifest };
}

export async function exportBackup(
  options: Partial<BackupExportOptions> = {},
): Promise<BackupManifest> {
  const { blob, manifest } = await buildBackupZip(options);
  downloadBlob(blob, formatBackupFileName(manifest.createdAt));
  return manifest;
}
