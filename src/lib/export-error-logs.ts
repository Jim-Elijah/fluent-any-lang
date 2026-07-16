import { getErrorLogList } from '../db/error-log.js';
import { getAppBuildInfo } from './app-build-info.js';
import { downloadBlob } from './export-content.js';

export type ErrorLogExportPayload = {
  exportedAt: number;
  appVersion: string;
  commitHash: string;
  buildTime: string;
  entries: Awaited<ReturnType<typeof getErrorLogList>>;
};

function formatErrorLogFileName(exportedAt: number): string {
  const d = new Date(exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `fluentanylang-errors-${stamp}.json`;
}

export async function buildErrorLogExport(): Promise<ErrorLogExportPayload> {
  const build = getAppBuildInfo();
  const entries = await getErrorLogList();
  return {
    exportedAt: Date.now(),
    appVersion: build.appVersion,
    commitHash: build.commitHash,
    buildTime: build.buildTime,
    entries,
  };
}

export async function exportErrorLogs(): Promise<ErrorLogExportPayload> {
  const payload = await buildErrorLogExport();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, formatErrorLogFileName(payload.exportedAt));
  return payload;
}
