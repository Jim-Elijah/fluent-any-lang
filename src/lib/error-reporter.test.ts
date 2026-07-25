import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase } from '../test/db-helpers.js';

describe('app-build-info', () => {
  it('returns injected build constants', async () => {
    const { getAppBuildInfo } = await import('./app-build-info.js');
    const info = getAppBuildInfo();
    expect(info.appVersion).toMatch(/\d+\.\d+\.\d+/);
    expect(info.commitHash.length).toBeGreaterThan(0);
    expect(typeof info.buildTime).toBe('string');
  });
});

describe('error-reporter', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterEach(async () => {
    const { uninstallGlobalErrorHandlersForTests } = await import('./error-reporter.js');
    uninstallGlobalErrorHandlersForTests();
  });

  it('normalizes Error instances and truncates long stacks', async () => {
    const { normalizeError } = await import('./error-reporter.js');
    const err = new Error('short');
    err.stack = `Error: short\n${'x'.repeat(20_000)}`;
    const normalized = normalizeError(err);
    expect(normalized.message).toBe('short');
    expect(normalized.name).toBe('Error');
    expect(normalized.stack!.endsWith('…')).toBe(true);
    expect(normalized.stack!.length).toBeLessThanOrEqual(8_001);
  });

  it('normalizes non-Error values', async () => {
    const { normalizeError } = await import('./error-reporter.js');
    expect(normalizeError('plain')).toEqual({ message: 'plain' });
    expect(normalizeError({ code: 42 }).message).toContain('42');
  });

  it('persists reportError entries to IndexedDB', async () => {
    const { reportError } = await import('./error-reporter.js');
    const { getErrorLogList } = await import('../db/error-log.js');

    await reportError(new Error('persisted'), { where: 'unit-test' });

    const list = await getErrorLogList();
    expect(list).toHaveLength(1);
    expect(list[0]?.message).toBe('persisted');
    expect(list[0]?.source).toBe('reportError');
    expect(list[0]?.extra).toEqual({ where: 'unit-test' });
    expect(list[0]?.stack).toBeTruthy();
    expect(list[0]?.appVersion).toBeTruthy();
    expect(list[0]?.commitHash).toBeTruthy();
  });

  it('installs global handlers that record unhandledrejection', async () => {
    const { installGlobalErrorHandlers } = await import('./error-reporter.js');
    const { getErrorLogList } = await import('../db/error-log.js');

    installGlobalErrorHandlers();
    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: new Error('rejected') });
    window.dispatchEvent(event);

    await vi.waitFor(async () => {
      expect(await getErrorLogList()).toHaveLength(1);
    });

    const list = await getErrorLogList();
    expect(list[0]?.source).toBe('unhandledrejection');
    expect(list[0]?.message).toBe('rejected');
  });

  it('installs global handlers that record window.onerror', async () => {
    const { installGlobalErrorHandlers } = await import('./error-reporter.js');
    const { getErrorLogList } = await import('../db/error-log.js');

    installGlobalErrorHandlers();
    const event = new ErrorEvent('error', {
      message: 'Uncaught',
      filename: 'app.js',
      lineno: 12,
      colno: 3,
    });
    Object.defineProperty(event, 'error', { value: new Error('window boom') });
    window.dispatchEvent(event);

    await vi.waitFor(async () => {
      expect(await getErrorLogList()).toHaveLength(1);
    });

    const list = await getErrorLogList();
    expect(list[0]?.source).toBe('window.onerror');
    expect(list[0]?.message).toBe('window boom');
    expect(list[0]?.extra).toMatchObject({ filename: 'app.js', lineno: 12, colno: 3 });
  });

  it('falls back to event.message when window error has no Error object', async () => {
    const { installGlobalErrorHandlers } = await import('./error-reporter.js');
    const { getErrorLogList } = await import('../db/error-log.js');

    installGlobalErrorHandlers();
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'script error', filename: 'x.js', lineno: 1, colno: 1 }),
    );

    await vi.waitFor(async () => {
      expect(await getErrorLogList()).toHaveLength(1);
    });
    expect((await getErrorLogList())[0]?.message).toBe('script error');
  });

  it('skips nested reportError calls while persisting', async () => {
    const errorLog = await import('../db/error-log.js');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(errorLog, 'addErrorLog').mockImplementation(async () => {
      await gate;
    });

    const { reportError } = await import('./error-reporter.js');
    const first = reportError(new Error('first'));
    await reportError(new Error('nested'));
    expect(consoleSpy).toHaveBeenCalledWith(
      '[error-reporter] nested report skipped',
      expect.any(Error),
      undefined,
    );

    release();
    await first;
    consoleSpy.mockRestore();
    vi.mocked(errorLog.addErrorLog).mockRestore();
  });

  it('logs persist failures without re-entering reportError', async () => {
    const errorLog = await import('../db/error-log.js');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(errorLog, 'addErrorLog').mockRejectedValue(new Error('db down'));

    const { reportError } = await import('./error-reporter.js');
    await reportError(new Error('original'));

    expect(consoleSpy).toHaveBeenCalledWith(
      '[error-reporter] failed to persist error',
      expect.any(Error),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
    vi.mocked(errorLog.addErrorLog).mockRestore();
  });

  it('normalizes Error cause and empty messages', async () => {
    const { normalizeError, reportError } = await import('./error-reporter.js');
    const { getErrorLogList } = await import('../db/error-log.js');

    const err = new Error('');
    err.name = 'CustomError';
    err.cause = 'x'.repeat(2_000);
    const normalized = normalizeError(err);
    expect(normalized.message).toBe('CustomError');
    expect(normalized.cause!.endsWith('…')).toBe(true);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await reportError(new Error('extra'), circular);
    expect((await getErrorLogList())[0]?.extra).toEqual({ unserializable: true });

    await reportError(new Error('big-extra'), { blob: 'y'.repeat(5_000) });
    const extra = (await getErrorLogList())[1]?.extra as { truncated?: boolean };
    expect(extra.truncated).toBe(true);
  });

  it('installGlobalErrorHandlers is idempotent', async () => {
    const { installGlobalErrorHandlers, reportError } = await import('./error-reporter.js');
    const { getErrorLogList } = await import('../db/error-log.js');

    installGlobalErrorHandlers();
    installGlobalErrorHandlers();
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'once', filename: 'x.js', lineno: 1, colno: 1 }),
    );

    await vi.waitFor(async () => {
      expect(await getErrorLogList()).toHaveLength(1);
    });
    await reportError(new Error('manual'));
    expect((await getErrorLogList()).some((entry) => entry.message === 'manual')).toBe(true);
  });

  it('falls back when locale storage is unavailable', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { reportError } = await import('./error-reporter.js');
    const { getErrorLogList } = await import('../db/error-log.js');

    await reportError(new Error('locale-fallback'));
    expect((await getErrorLogList())[0]?.locale).toBe('zh-CN');
    getItem.mockRestore();
  });
});

describe('export-error-logs', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('builds an export payload with entries and build info', async () => {
    const { reportError } = await import('./error-reporter.js');
    const { buildErrorLogExport } = await import('./export-error-logs.js');

    await reportError(new Error('export-me'));
    const payload = await buildErrorLogExport();

    expect(payload.entries).toHaveLength(1);
    expect(payload.appVersion).toBeTruthy();
    expect(payload.commitHash).toBeTruthy();
    expect(payload.exportedAt).toBeTypeOf('number');
  });
});
