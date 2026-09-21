import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { NoiseItem } from '../types/models.js';
import {
  addNoise,
  deleteNoise,
  deleteNoiseBatch,
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

  it('deleteNoiseBatch removes multiple items in one transaction', async () => {
    const a = makeNoise('noise-a', 'hash-a');
    const b = makeNoise('noise-b', 'hash-b');
    await addNoise(a, { noiseId: a.id, blob: new Blob(['a']) });
    await addNoise(b, { noiseId: b.id, blob: new Blob(['b']) });

    await deleteNoiseBatch([a.id, b.id]);

    expect(await getNoise(a.id)).toBeUndefined();
    expect(await getNoise(b.id)).toBeUndefined();
    expect(await getNoiseList()).toHaveLength(0);
  });
});
