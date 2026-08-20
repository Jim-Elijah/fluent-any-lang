import { msg } from '@lit/localize';

import type { ImportResult } from '../../types/models.js';
import { Message } from '../ui/message.js';

/** Surface import diagnostics from `importSubtitleForMedia` / `runSubtitleImport`. */
export function reportSubtitleImportResult(result: ImportResult): void {
  for (const error of result.errors) {
    Message.error({ message: `${error.filename}: ${error.message}` });
  }
  for (const warning of result.warnings) {
    Message.warning({ message: `${warning.filename}: ${warning.message}` });
  }
  for (const skipped of result.skipped) {
    Message.info({ message: `${skipped.filename}: ${skipped.message}` });
  }
  if (result.conflicts.length > 0) {
    Message.info({
      message: result.conflicts[0]?.message ?? msg('该媒体已有不同内容的字幕'),
    });
  }
}
