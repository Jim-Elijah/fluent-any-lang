import type { IDBPDatabase } from 'idb';

import type {
  ErrorLogEntry,
  MediaBlob,
  MediaItem,
  Playlist,
  PracticeRecord,
  PracticeSession,
  SentenceBankBlob,
  SentenceBankEntry,
  SubtitleTrack,
  PracticeRecordBlob,
} from '../types/models.js';

export const DB_NAME = 'fluent-any-lang';
export const DB_VERSION = 11;

export const STORE_MEDIA = 'media';
export const STORE_MEDIA_BLOB = 'mediaBlob';
export const STORE_SUBTITLE = 'subtitle';
export const STORE_RECORDING = 'record';
export const STORE_RECORDING_BLOB = 'recordBlob';
export const STORE_PRACTICE_SESSION = 'practiceSession';
export const STORE_ERROR_LOG = 'errorLog';
export const STORE_PLAYLIST = 'playlist';
export const STORE_SENTENCE_BANK = 'sentenceBank';
export const STORE_SENTENCE_BANK_BLOB = 'sentenceBankBlob';

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
  [STORE_PLAYLIST]: {
    key: string;
    value: Playlist;
    indexes: { bySortOrder: number };
  };
  [STORE_SENTENCE_BANK]: {
    key: string;
    value: SentenceBankEntry;
    indexes: {
      byContentHash: string;
      byCreatedAt: number;
      bySourceMediaId: string;
    };
  };
  [STORE_SENTENCE_BANK_BLOB]: {
    key: string;
    value: SentenceBankBlob;
  };
}

export type AppDatabase = IDBPDatabase<FluentAnyLangDB>;
