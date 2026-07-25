import { describe, expect, it, vi } from 'vitest';

describe('getAppBuildInfo', () => {
  it('returns injected build globals when defined', async () => {
    vi.resetModules();
    vi.stubGlobal('__APP_VERSION__', '9.9.9');
    vi.stubGlobal('__COMMIT_HASH__', 'deadbeef');
    vi.stubGlobal('__BUILD_TIME__', '2026-07-25T00:00:00.000Z');

    const { getAppBuildInfo } = await import('./app-build-info.js');
    expect(getAppBuildInfo()).toEqual({
      appVersion: '9.9.9',
      commitHash: 'deadbeef',
      buildTime: '2026-07-25T00:00:00.000Z',
    });

    vi.unstubAllGlobals();
  });
});
