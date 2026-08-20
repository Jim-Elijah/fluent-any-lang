import { titleFromFileName } from './file-validation.js';
import { importSubtitleForMedia } from './import-content.js';
import type { ImportResult, SubtitleTrack } from '../types/models.js';

export type SubtitleImportOptions = {
  overwrite?: boolean;
};

export type PendingSubtitleImport = {
  mediaId: string;
  file: File;
  overwrite: boolean;
};

/** Whether subtitle basename matches the target media filename (case-insensitive). */
export function subtitleBasenameMatchesMedia(
  subtitleFile: File,
  mediaFilename: string,
): boolean {
  return (
    titleFromFileName(subtitleFile.name).toLocaleLowerCase() ===
    titleFromFileName(mediaFilename).toLocaleLowerCase()
  );
}

export function findImportedSubtitleTrack(
  result: ImportResult,
  mediaId: string,
): SubtitleTrack | undefined {
  return result.imported.find(
    (item): item is SubtitleTrack => 'segments' in item && item.mediaId === mediaId,
  );
}

export async function runSubtitleImport(
  mediaId: string,
  file: File,
  options: SubtitleImportOptions = {},
): Promise<ImportResult> {
  return importSubtitleForMedia(mediaId, file, options.overwrite ? { overwrite: true } : {});
}
