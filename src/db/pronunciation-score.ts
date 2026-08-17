import { getDB } from './index.js';
import { STORE_PRONUNCIATION_SCORE } from './schema.js';
import type { PronunciationScore } from '../types/models.js';

export async function putPronunciationScore(score: PronunciationScore): Promise<void> {
  const db = await getDB();
  await db.put(STORE_PRONUNCIATION_SCORE, score);
}

export async function getPronunciationScore(id: string): Promise<PronunciationScore | undefined> {
  const db = await getDB();
  return db.get(STORE_PRONUNCIATION_SCORE, id);
}

export async function getScoreByRecordId(
  recordId: string,
): Promise<PronunciationScore | undefined> {
  const db = await getDB();
  return db.getFromIndex(STORE_PRONUNCIATION_SCORE, 'byRecordId', recordId);
}

export async function getScoresByRecordIds(
  recordIds: readonly string[],
): Promise<Map<string, PronunciationScore>> {
  const result = new Map<string, PronunciationScore>();
  if (recordIds.length === 0) {
    return result;
  }

  const db = await getDB();
  const tx = db.transaction(STORE_PRONUNCIATION_SCORE, 'readonly');
  const index = tx.objectStore(STORE_PRONUNCIATION_SCORE).index('byRecordId');
  await Promise.all(
    recordIds.map(async (recordId) => {
      const score = await index.get(recordId);
      if (score) {
        result.set(recordId, score);
      }
    }),
  );
  await tx.done;
  return result;
}

export async function getAllPronunciationScores(): Promise<PronunciationScore[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_PRONUNCIATION_SCORE, 'byCreatedAt');
}

export async function deleteScoreByRecordId(recordId: string): Promise<void> {
  const db = await getDB();
  const existing = await db.getFromIndex(STORE_PRONUNCIATION_SCORE, 'byRecordId', recordId);
  if (!existing) {
    return;
  }
  await db.delete(STORE_PRONUNCIATION_SCORE, existing.id);
}
