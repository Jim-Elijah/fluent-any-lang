import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { NoiseItem } from '../types/models.js';
import {
  addNoise,
  deleteNoise,
  getNoise,
  getNoiseByContentHash,
  getNoiseBlob,
  getNoiseList,
} from './noise.js';

function makeNoise(id = 'noise-1', contentHash = 'hash-1'): NoiseItem {
  return {
    id,
    title: 'Cafe',
    filename: 'cafe.mp3',
    size: 100,
    mimeType: 'audio/mpeg',
    duration: 12,
    createdAt: Date.now(),
    contentHash,
  };
}

describe('noise db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('adds, lists, and reads blob', async () => {
    const item = makeNoise();
    const blob = new Blob(['noise-bytes'], { type: 'audio/mpeg' });
    await addNoise(item, { noiseId: item.id, blob });

    expect(await getNoise(item.id)).toEqual(item);
    expect(await getNoiseByContentHash(item.contentHash)).toEqual(item);
    expect(await getNoiseBlob(item.id)).toBeTruthy();
    const list = await getNoiseList();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(item.id);
  });

  it('deletes metadata and blob', async () => {
    const item = makeNoise();
    await addNoise(item, { noiseId: item.id, blob: new Blob(['x']) });
    await deleteNoise(item.id);
    expect(await getNoise(item.id)).toBeUndefined();
    expect(await getNoiseBlob(item.id)).toBeUndefined();
  });
});
