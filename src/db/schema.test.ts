import { describe, expect, it } from 'vitest';

import {
  DB_NAME,
  DB_VERSION,
  STORE_MEDIA,
  STORE_MEDIA_BLOB,
  STORE_PRACTICE_SESSION,
  STORE_RECORDING,
  STORE_RECORDING_BLOB,
  STORE_SUBTITLE,
} from './schema.js';

describe('db schema constants', () => {
  it('defines stable database identity', () => {
    expect(DB_NAME).toBe('fluent-any-lang');
    expect(DB_VERSION).toBe(2);
  });

  it('defines all object store names', () => {
    expect({
      STORE_MEDIA,
      STORE_MEDIA_BLOB,
      STORE_SUBTITLE,
      STORE_RECORDING,
      STORE_RECORDING_BLOB,
      STORE_PRACTICE_SESSION,
    }).toEqual({
      STORE_MEDIA: 'media',
      STORE_MEDIA_BLOB: 'mediaBlob',
      STORE_SUBTITLE: 'subtitle',
      STORE_RECORDING: 'record',
      STORE_RECORDING_BLOB: 'recordBlob',
      STORE_PRACTICE_SESSION: 'practiceSession',
    });
  });
});
