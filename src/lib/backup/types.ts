import type { AppSettings } from '../../types/models.js';

export const BACKUP_FORMAT_VERSION = 4 as const;

export type BackupExportOptions = {
  /** Include media blobs + matching subtitles. Default false. */
  includeMedia: boolean;
  /** Include practice recordings + blobs. Default true. */
  includeRecordings: boolean;
  /** Include practice session analytics. Default true. */
  includeSessions: boolean;
  /** Include sentence bank entries + clipped blobs. Default true. */
  includeSentenceBank: boolean;
  /** Include ambient noise assets. Default true. */
  includeNoise: boolean;
};

export type BackupManifest = {
  version: typeof BACKUP_FORMAT_VERSION;
  createdAt: number;
  appVersion: string;
  flags: {
    includeMedia: boolean;
    includeRecordings: boolean;
    includeSessions: boolean;
    includeSettings: true;
    /** Always true in v2+; v1 did not include playlists. */
    includePlaylists: true;
    includeSentenceBank: boolean;
    includeNoise: boolean;
  };
  counts: {
    media: number;
    subtitles: number;
    recordings: number;
    sessions: number;
    playlists: number;
    sentenceBank: number;
    noise: number;
  };
};

export type BackupPreview = {
  manifest: BackupManifest;
  settings: AppSettings | null;
  hasMediaBlobs: boolean;
  hasRecordings: boolean;
  hasSessions: boolean;
  hasSentenceBank: boolean;
  hasNoise: boolean;
};

export type BackupImportResult = {
  settingsApplied: boolean;
  mediaImported: number;
  mediaSkipped: number;
  subtitlesImported: number;
  subtitlesSkipped: number;
  recordingsImported: number;
  recordingsSkipped: number;
  sessionsImported: number;
  sessionsSkipped: number;
  sentenceBankImported: number;
  sentenceBankSkipped: number;
  noiseImported: number;
  noiseSkipped: number;
  errors: string[];
};

export const DEFAULT_BACKUP_EXPORT_OPTIONS: BackupExportOptions = {
  includeMedia: false,
  includeRecordings: true,
  includeSessions: true,
  includeSentenceBank: true,
  includeNoise: true,
};
