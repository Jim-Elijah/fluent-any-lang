import { openDB } from 'idb';

import {
  DB_NAME,
  DB_VERSION,
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_RECORDING_BLOB,
  STORE_RECORDING,
  STORE_SUBTITLE,
  type AppDatabase,
  type FluentAnyLangDB,
} from './schema.js';

let dbPromise: Promise<AppDatabase> | null = null;

export function getDB(): Promise<AppDatabase> {
  if (!dbPromise) {
    dbPromise = openDB<FluentAnyLangDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // media metadata
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
          mediaStore.createIndex('byCreatedAt', 'createdAt');
          mediaStore.createIndex('byTitle', 'title', { unique: false });
        }
        // media blob

        if (!db.objectStoreNames.contains(STORE_MEDIA_BLOB)) {
          db.createObjectStore(STORE_MEDIA_BLOB, { keyPath: 'mediaId' });
        }

        // subtitle
        if (!db.objectStoreNames.contains(STORE_SUBTITLE)) {
          const subtitleStore = db.createObjectStore(STORE_SUBTITLE, { keyPath: 'id' });
          subtitleStore.createIndex('byTitle', 'title' /* { unique: false } */);
        }

        // recording metadata
        if (!db.objectStoreNames.contains(STORE_RECORDING)) {
          const recordingsStore = db.createObjectStore(STORE_RECORDING, { keyPath: 'id' });
          recordingsStore.createIndex('byMediaId', 'mediaId');
          recordingsStore.createIndex('byCreatedAt', 'createdAt');
        }
        // recording blob
        if (!db.objectStoreNames.contains(STORE_RECORDING_BLOB)) {
          db.createObjectStore(STORE_RECORDING_BLOB, { keyPath: 'recordId' });
        }
      },
    });
  }

  return dbPromise;
}
