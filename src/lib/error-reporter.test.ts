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
