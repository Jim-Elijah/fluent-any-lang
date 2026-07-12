import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { PracticeSession } from '../types/models.js';
import { toLocalDateKey } from './practice-session.js';

function makeSession(overrides: Partial<PracticeSession> = {}): PracticeSession {
  const startedAt = overrides.startedAt ?? 1_700_000_000_000;
  return {
    id: 'sess-1',
    mediaId: 'media-1',
    mediaTitle: 'Song A',
    mediaType: 'audio',
    mediaFilename: 'Song A.mp3',
    mode: 'listening',
    startedAt,
    endedAt: startedAt + 5_000,
    activeMs: 5_000,
    dateKey: toLocalDateKey(startedAt),
    ...overrides,
  };
}

describe('practice-session db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('adds and lists sessions by startedAt', async () => {
    const { addPracticeSession, getAllPracticeSessions } = await import('./practice-session.js');
    const older = makeSession({ id: 'a', startedAt: 100, endedAt: 200, activeMs: 100 });
    const newer = makeSession({ id: 'b', startedAt: 300, endedAt: 400, activeMs: 100 });

    await addPracticeSession(older);
    await addPracticeSession(newer);

    expect((await getAllPracticeSessions()).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('queries by dateKey, mediaId, and mode', async () => {
    const {
      addPracticeSession,
      getPracticeSessionsByDateKey,
      getPracticeSessionsByMediaId,
      getPracticeSessionsByMode,
    } = await import('./practice-session.js');

    await addPracticeSession(
      makeSession({
        id: '1',
        mediaId: 'm1',
        mode: 'listening',
        dateKey: '2026-07-12',
        startedAt: 1,
      }),
    );
    await addPracticeSession(
      makeSession({
        id: '2',
        mediaId: 'm1',
        mode: 'shadowing',
        dateKey: '2026-07-12',
        startedAt: 2,
      }),
    );
    await addPracticeSession(
      makeSession({
        id: '3',
        mediaId: 'm2',
        mode: 'echo',
        dateKey: '2026-07-11',
        startedAt: 3,
      }),
    );

    expect((await getPracticeSessionsByDateKey('2026-07-12')).map((s) => s.id)).toEqual(['1', '2']);
    expect((await getPracticeSessionsByMediaId('m1')).map((s) => s.id)).toEqual(['1', '2']);
    expect((await getPracticeSessionsByMode('echo')).map((s) => s.id)).toEqual(['3']);
  });

  it('filters by startedAt range and clears all', async () => {
    const {
      addPracticeSession,
      getPracticeSessionsInRange,
      clearAllPracticeSessions,
      getAllPracticeSessions,
    } = await import('./practice-session.js');

    await addPracticeSession(makeSession({ id: 'a', startedAt: 10, endedAt: 20 }));
    await addPracticeSession(makeSession({ id: 'b', startedAt: 50, endedAt: 60 }));
    await addPracticeSession(makeSession({ id: 'c', startedAt: 100, endedAt: 110 }));

    expect((await getPracticeSessionsInRange(50, 100)).map((s) => s.id)).toEqual(['b', 'c']);

    await clearAllPracticeSessions();
    expect(await getAllPracticeSessions()).toEqual([]);
  });
});
