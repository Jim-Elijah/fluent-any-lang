import { describe, expect, it } from 'vitest';

import {
  findImportedSubtitleTrack,
  subtitleBasenameMatchesMedia,
} from './subtitle-import-helpers.js';
import type { ImportResult, SubtitleTrack } from '../types/models.js';

describe('subtitle-import-helpers', () => {
  it('matches subtitle basename to media filename case-insensitively', () => {
    const file = new File(['1'], 'Lesson.SRT', { type: 'application/x-subrip' });
    expect(subtitleBasenameMatchesMedia(file, 'lesson.mp3')).toBe(true);
    expect(subtitleBasenameMatchesMedia(file, 'other.mp3')).toBe(false);
  });

  it('finds imported subtitle track by media id', () => {
    const track: SubtitleTrack = {
      id: 'sub-1',
      mediaId: 'media-1',
      title: 'lesson',
      filename: 'lesson.srt',
      type: 'srt',
      contentHash: 'hash',
      segments: [],
    };
    const result: ImportResult = {
      imported: [track],
      errors: [],
      warnings: [],
      skipped: [],
      conflicts: [],
    };
    expect(findImportedSubtitleTrack(result, 'media-1')).toEqual(track);
    expect(findImportedSubtitleTrack(result, 'missing')).toBeUndefined();
  });
});
