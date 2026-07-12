import type { PracticeAnalyticsMode, PracticeSession } from '../types/models.js';
import { getDB } from './index.js';
import { STORE_PRACTICE_SESSION } from './schema.js';

/** 本地时区日期键 YYYY-MM-DD */
export function toLocalDateKey(timestamp = Date.now()): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function addPracticeSession(session: PracticeSession): Promise<void> {
  const db = await getDB();
  await db.put(STORE_PRACTICE_SESSION, session);
}

export async function getAllPracticeSessions(): Promise<PracticeSession[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_PRACTICE_SESSION, 'byStartedAt');
  return items;
}

export async function getPracticeSessionsByDateKey(dateKey: string): Promise<PracticeSession[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_PRACTICE_SESSION, 'byDateKey', dateKey);
}

export async function getPracticeSessionsByMediaId(mediaId: string): Promise<PracticeSession[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_PRACTICE_SESSION, 'byMediaId', mediaId);
}

export async function getPracticeSessionsByMode(
  mode: PracticeAnalyticsMode,
): Promise<PracticeSession[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_PRACTICE_SESSION, 'byMode', mode);
}

/** 按 startedAt 闭区间 [from, to] 过滤（读侧过滤，数据量小时足够） */
export async function getPracticeSessionsInRange(
  fromMs: number,
  toMs: number,
): Promise<PracticeSession[]> {
  const sessions = await getAllPracticeSessions();
  return sessions.filter((s) => s.startedAt >= fromMs && s.startedAt <= toMs);
}

export async function clearAllPracticeSessions(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_PRACTICE_SESSION);
}
