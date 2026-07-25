import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/error-log.js', () => ({
  getErrorLogList: vi.fn(),
}));

vi.mock('./app-build-info.js', () => ({
  getAppBuildInfo: vi.fn(() => ({
    appVersion: '1.2.3',
    commitHash: 'abc1234',
    buildTime: '2026-01-02T03:04:05.000Z',
  })),
}));

vi.mock('./export-content.js', () => ({
  downloadBlob: vi.fn(),
}));

import { getErrorLogList } from '../db/error-log.js';
import { downloadBlob } from './export-content.js';
import { buildErrorLogExport, exportErrorLogs } from './export-error-logs.js';

describe('export-error-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getErrorLogList).mockResolvedValue([
      {
        id: 'err-1',
        createdAt: 1_700_000_000_000,
        message: 'boom',
        source: 'manual',
      },
    ]);
  });

  it('builds a payload with build metadata and log entries', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_704_067_200_000);

    const payload = await buildErrorLogExport();

    expect(payload).toEqual({
      exportedAt: 1_704_067_200_000,
      appVersion: '1.2.3',
      commitHash: 'abc1234',
      buildTime: '2026-01-02T03:04:05.000Z',
      entries: [
        {
          id: 'err-1',
          createdAt: 1_700_000_000_000,
          message: 'boom',
          source: 'manual',
        },
      ],
    });
  });

  it('downloads a timestamped JSON file and returns the payload', async () => {
    const exportedAt = new Date(2024, 0, 2, 3, 4, 0).getTime();
    vi.spyOn(Date, 'now').mockReturnValue(exportedAt);

    const payload = await exportErrorLogs();

    expect(payload.appVersion).toBe('1.2.3');
    expect(payload.entries).toHaveLength(1);
    expect(downloadBlob).toHaveBeenCalledTimes(1);

    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0]!;
    expect(filename).toBe('fluentanylang-errors-20240102-0304.json');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');

    const parsed = JSON.parse(await blob.text());
    expect(parsed.commitHash).toBe('abc1234');
    expect(parsed.entries[0].message).toBe('boom');
  });
});
