import { describe, expect, it } from 'vitest';

import {
  DB_NAME,
  STORE_ERROR_LOG,
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_PLAYLIST,
  STORE_PRACTICE_SESSION,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_SENTENCE_BANK,
  STORE_SENTENCE_BANK_BLOB,
  STORE_SUBTITLE,
} from './schema.js';

describe('db schema constants', () => {
  it('defines stable database identity', () => {
    expect(DB_NAME).toBe('fluent-any-lang');
  });

  it('defines all object store names', () => {
    expect({
      STORE_MEDIA,
      STORE_MEDIA_BLOB,
      STORE_SUBTITLE,
      STORE_RECORDING,
      STORE_RECORDING_BLOB,
      STORE_PRACTICE_SESSION,
      STORE_ERROR_LOG,
      STORE_PLAYLIST,
      STORE_SENTENCE_BANK,
      STORE_SENTENCE_BANK_BLOB,
    }).toEqual({
      STORE_MEDIA: 'media',
      STORE_MEDIA_BLOB: 'mediaBlob',
      STORE_SUBTITLE: 'subtitle',
      STORE_RECORDING: 'record',
      STORE_RECORDING_BLOB: 'recordBlob',
      STORE_PRACTICE_SESSION: 'practiceSession',
      STORE_ERROR_LOG: 'errorLog',
      STORE_PLAYLIST: 'playlist',
      STORE_SENTENCE_BANK: 'sentenceBank',
      STORE_SENTENCE_BANK_BLOB: 'sentenceBankBlob',
    });
  });
});
