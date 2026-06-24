import type { IDBPDatabase } from 'idb';

import type {
  MediaBlob,
  MediaItem,
  PracticeRecord,
  SubtitleTrack,
  PracticeRecordBlob,
} from '../types/models.js';

export const DB_NAME = 'fluent-any-lang';
export const DB_VERSION = 1;

export const STORE_MEDIA = 'media';
export const STORE_MEDIA_BLOB = 'mediaBlob';
export const STORE_SUBTITLE = 'subtitle';
export const STORE_RECORDING = 'record';
export const STORE_RECORDING_BLOB = 'recordBlob';

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
    indexes: { byTitle: string };
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
}

export type AppDatabase = IDBPDatabase<FluentAnyLangDB>;
