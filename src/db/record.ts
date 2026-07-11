import { getDB } from './index.js';
import { STORE_RECORDING_BLOB, STORE_RECORDING } from './schema.js';
import type { PracticeMode, PracticeRecordBlob, PracticeRecord } from '../types/models.js';

function isEchoRecord(record: PracticeRecord): boolean {
  return record.mode === 'echo';
}

function isShadowingRecord(record: PracticeRecord): boolean {
  return record.mode === 'shadowing';
}

// create/insert
// add recording and its blob
export async function saveRecording(record: PracticeRecord, blob: Blob): Promise<void> {
  const db = await getDB();
  const recordBlob: PracticeRecordBlob = {
    recordId: record.id,
    blob,
  };

  console.log('saveRecording', record, blob);

  const tx = db.transaction([STORE_RECORDING, STORE_RECORDING_BLOB], 'readwrite');

  await tx.objectStore(STORE_RECORDING).put(record);
  await tx.objectStore(STORE_RECORDING_BLOB).put(recordBlob);

  await tx.done;
}

// read
export async function getRecordingList(): Promise<PracticeRecord[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_RECORDING, 'byCreatedAt');
  return items.reverse();
}

export async function findRecordings(mediaId: string): Promise<PracticeRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_RECORDING, 'byMediaId', mediaId);
}

export async function getRecordingBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  const record = await db.get(STORE_RECORDING_BLOB, id);
  return record?.blob;
}

export async function countRecording(mediaId: string): Promise<number> {
  const db = await getDB();
  return db.countFromIndex(STORE_RECORDING, 'byMediaId', mediaId);
}

export async function findRecordingsByMode(
  mediaId: string,
  mode: PracticeMode,
): Promise<PracticeRecord[]> {
  const items = await findRecordings(mediaId);
  return items.filter((item) => item.mode === mode);
}

export async function countShadowingRecordings(mediaId: string): Promise<number> {
  const items = await findRecordings(mediaId);
  return items.filter(isShadowingRecord).length;
}

export async function findEchoRecordings(
  mediaId: string,
  segmentId: string,
): Promise<PracticeRecord[]> {
  const items = await findRecordings(mediaId);
  return items
    .filter((item) => isEchoRecord(item) && item.segmentId === segmentId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function countEchoRecordings(mediaId: string, segmentId: string): Promise<number> {
  const items = await findEchoRecordings(mediaId, segmentId);
  return items.length;
}

export async function findAllEchoRecordings(mediaId: string): Promise<PracticeRecord[]> {
  const items = await findRecordings(mediaId);
  return items.filter(isEchoRecord).sort((a, b) => b.createdAt - a.createdAt);
}

// delete
// delete recording and its blob
export async function deleteRecording(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction([STORE_RECORDING, STORE_RECORDING_BLOB], 'readwrite');

  await tx.objectStore(STORE_RECORDING).delete(id);
  await tx.objectStore(STORE_RECORDING_BLOB).delete(id);

  await tx.done;
}
