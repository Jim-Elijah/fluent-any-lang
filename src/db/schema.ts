import type { IDBPDatabase } from 'idb';

import type {
  ErrorLogEntry,
  MediaBlob,
  MediaItem,
  PracticeRecord,
  PracticeSession,
  SubtitleTrack,
  PracticeRecordBlob,
} from '../types/models.js';

export const DB_NAME = 'fluent-any-lang';
export const DB_VERSION = 6;

export const STORE_MEDIA = 'media';
export const STORE_MEDIA_BLOB = 'mediaBlob';
export const STORE_SUBTITLE = 'subtitle';
export const STORE_RECORDING = 'record';
export const STORE_RECORDING_BLOB = 'recordBlob';
export const STORE_PRACTICE_SESSION = 'practiceSession';
export const STORE_ERROR_LOG = 'errorLog';

/** Max retained error log entries (oldest dropped first). */
export const ERROR_LOG_MAX_ENTRIES = 200;

export interface FluentAnyLangDB {
  [STORE_MEDIA]: {
    key: string;
    value: MediaItem;
    indexes: { byCreatedAt: number; byTitle: string };
  };
  [STORE_MEDIA_BLOB]: {
    key: string;
    value: MediaBlob;
  };
  [STORE_SUBTITLE]: {
    key: string;
    value: SubtitleTrack;
    indexes: { byTitle: string; byMediaId: string };
  };
  [STORE_RECORDING]: {
    key: string;
    value: PracticeRecord;
    indexes: { byMediaId: string; byCreatedAt: number };
  };
  [STORE_RECORDING_BLOB]: {
    key: string;
    value: PracticeRecordBlob;
  };
  [STORE_PRACTICE_SESSION]: {
    key: string;
    value: PracticeSession;
    indexes: {
      byDateKey: string;
      byMediaId: string;
      byMode: string;
      byStartedAt: number;
    };
  };
  [STORE_ERROR_LOG]: {
    key: string;
    value: ErrorLogEntry;
    indexes: { byCreatedAt: number };
  };
}

export type AppDatabase = IDBPDatabase<FluentAnyLangDB>;
