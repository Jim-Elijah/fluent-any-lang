import { getDB } from './index.js';
import { STORE_NOISE, STORE_NOISE_BLOB } from './schema.js';
import type { NoiseBlob, NoiseItem } from '../types/models.js';

export async function addNoise(item: NoiseItem, blob: NoiseBlob): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_NOISE, STORE_NOISE_BLOB], 'readwrite');
  await tx.objectStore(STORE_NOISE).put(item);
  await tx.objectStore(STORE_NOISE_BLOB).put(blob);
  await tx.done;
}

export async function getNoiseList(): Promise<NoiseItem[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_NOISE, 'byCreatedAt');
  return items.reverse();
}

export async function getNoise(id: string): Promise<NoiseItem | undefined> {
  const db = await getDB();
  return db.get(STORE_NOISE, id);
}

export async function getNoiseByContentHash(contentHash: string): Promise<NoiseItem | undefined> {
  const db = await getDB();
  return db.getFromIndex(STORE_NOISE, 'byContentHash', contentHash);
}

export async function getNoiseBlob(noiseId: string): Promise<Blob | undefined> {
  const db = await getDB();
  const record = await db.get(STORE_NOISE_BLOB, noiseId);
  return record?.blob;
}

export async function countNoise(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_NOISE);
}

export async function deleteNoiseBatch(ids: string[]): Promise<void> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const db = await getDB();
  const tx = db.transaction([STORE_NOISE, STORE_NOISE_BLOB], 'readwrite');
  const noiseStore = tx.objectStore(STORE_NOISE);
  const blobStore = tx.objectStore(STORE_NOISE_BLOB);
  for (const id of uniqueIds) {
    await noiseStore.delete(id);
    await blobStore.delete(id);
  }
  await tx.done;
}

export async function deleteNoise(id: string): Promise<void> {
  await deleteNoiseBatch([id]);
}
