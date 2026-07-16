import { beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';
import type { ErrorLogEntry } from '../types/models.js';
import { ERROR_LOG_MAX_ENTRIES } from './schema.js';

function makeEntry(overrides: Partial<ErrorLogEntry> = {}): ErrorLogEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    createdAt: overrides.createdAt ?? Date.now(),
    message: overrides.message ?? 'boom',
    source: overrides.source ?? 'reportError',
    appVersion: overrides.appVersion ?? '0.1.0',
    commitHash: overrides.commitHash ?? 'abc1234',
    userAgent: overrides.userAgent ?? 'test',
    locale: overrides.locale ?? 'zh-CN',
    route: overrides.route ?? '/',
    href: overrides.href ?? 'http://localhost/',
    offline: overrides.offline ?? false,
    ...overrides,
  };
}

describe('error-log db', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('adds and lists entries by createdAt', async () => {
    const { addErrorLog, getErrorLogList, getErrorLogCount } = await import('./error-log.js');

    await addErrorLog(makeEntry({ id: 'a', createdAt: 100, message: 'first' }));
    await addErrorLog(makeEntry({ id: 'b', createdAt: 200, message: 'second' }));

    const list = await getErrorLogList();
    expect(list.map((e) => e.id)).toEqual(['a', 'b']);
    expect(await getErrorLogCount()).toBe(2);
  });

  it('drops oldest entries when over the max', async () => {
    const { addErrorLog, getErrorLogList } = await import('./error-log.js');

    for (let i = 0; i < ERROR_LOG_MAX_ENTRIES + 5; i++) {
      await addErrorLog(
        makeEntry({
          id: `e-${i}`,
          createdAt: i + 1,
          message: `msg-${i}`,
        }),
      );
    }

    const list = await getErrorLogList();
    expect(list).toHaveLength(ERROR_LOG_MAX_ENTRIES);
    expect(list[0]?.id).toBe('e-5');
    expect(list[list.length - 1]?.id).toBe(`e-${ERROR_LOG_MAX_ENTRIES + 4}`);
  });

  it('clears all entries', async () => {
    const { addErrorLog, clearErrorLogs, getErrorLogCount } = await import('./error-log.js');
    await addErrorLog(makeEntry({ id: 'x' }));
    await clearErrorLogs();
    expect(await getErrorLogCount()).toBe(0);
  });
});
