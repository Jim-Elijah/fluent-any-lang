import { describe, expect, it } from 'vitest';

import {
  durationsMatch,
  getBaseName,
  getFileExtension,
  getMediaType,
  hashString,
  isAudioFile,
  isLrcFile,
  isMediaFile,
  isSameFile,
  isSameMediaContent,
  isSrtFile,
  isVideoFile,
  mediaSizesMatch,
  resolveMimeType,
  titleFromFileName,
  titleTypeKey,
  validateMediaFile,
} from './file-validation.js';

function makeFile(name: string, type = ''): File {
  return new File(['content'], name, { type });
}

describe('getFileExtension', () => {
  it('extracts lowercase extension', () => {
    expect(getFileExtension('song.MP3')).toBe('mp3');
    expect(getFileExtension('no-extension')).toBe('');
    expect(getFileExtension('.hidden')).toBe('');
  });
});

describe('getBaseName', () => {
  it('strips extension from filename', () => {
    expect(getBaseName('lesson.mp3')).toBe('lesson');
    expect(getBaseName('no-extension')).toBe('no-extension');
  });
});

describe('resolveMimeType', () => {
  it('prefers file.type when present', () => {
    expect(resolveMimeType(makeFile('x.bin', 'audio/mpeg'))).toBe('audio/mpeg');
  });

  it('falls back to extension mapping', () => {
    expect(resolveMimeType(makeFile('song.mp3'))).toBe('audio/mpeg');
    expect(resolveMimeType(makeFile('clip.mp4'))).toBe('video/mp4');
  });
});

describe('media type checks', () => {
  it('identifies audio files', () => {
    expect(isAudioFile(makeFile('a.wav', 'audio/wav'))).toBe(true);
    expect(isAudioFile(makeFile('a.mp3'))).toBe(true);
    expect(isAudioFile(makeFile('a.mp4'))).toBe(false);
  });

  it('identifies video files', () => {
    expect(isVideoFile(makeFile('v.mp4', 'video/mp4'))).toBe(true);
    expect(isVideoFile(makeFile('v.mkv'))).toBe(true);
    expect(isVideoFile(makeFile('a.mp3'))).toBe(false);
  });

  it('identifies media files', () => {
    expect(isMediaFile(makeFile('a.ogg'))).toBe(true);
    expect(isMediaFile(makeFile('notes.txt'))).toBe(false);
  });

  it('identifies subtitle files', () => {
    expect(isSrtFile(makeFile('sub.srt'))).toBe(true);
    expect(isLrcFile(makeFile('lyrics.lrc'))).toBe(true);
    expect(isSrtFile(makeFile('sub.lrc'))).toBe(false);
  });
});

describe('getMediaType', () => {
  it('maps mime to audio or video', () => {
    expect(getMediaType('audio/mpeg')).toBe('audio');
    expect(getMediaType('video/mp4')).toBe('video');
  });
});

describe('titleFromFileName', () => {
  it('uses basename without extension', () => {
    expect(titleFromFileName('My Lesson.mp3')).toBe('My Lesson');
  });
});

describe('hashString', () => {
  it('returns a stable SHA-256 hex digest', async () => {
    const hash = await hashString('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashString('hello')).toBe(hash);
    expect(await hashString('world')).not.toBe(hash);
  });
});

describe('validateMediaFile', () => {
  it('accepts supported media', () => {
    expect(validateMediaFile(makeFile('song.mp3'))).toEqual({ valid: true });
  });

  it('rejects unsupported files', () => {
    const result = validateMediaFile(makeFile('readme.txt', 'text/plain'));
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('isSameMediaContent', () => {
  it('requires id, size, duration, and contentHash to match', () => {
    const base = { id: 'a', size: 10, duration: 12.5, contentHash: 'h1' };
    expect(isSameMediaContent(base, { ...base })).toBe(true);
    expect(isSameMediaContent(base, { ...base, size: 11 })).toBe(false);
    expect(isSameMediaContent(base, { ...base, contentHash: 'h2' })).toBe(false);
    expect(isSameMediaContent({ ...base, contentHash: '' }, base)).toBe(false);
  });

  it('allows small duration drift', () => {
    expect(durationsMatch(12.5, 12.54)).toBe(true);
    expect(durationsMatch(12.5, 12.6)).toBe(false);
  });

  it('mediaSizesMatch compares size only', () => {
    expect(mediaSizesMatch({ size: 10 }, { size: 10 })).toBe(true);
    expect(mediaSizesMatch({ size: 10 }, { size: 11 })).toBe(false);
  });
});

describe('isSameFile', () => {
  it('compares name, size, type, and content hash', async () => {
    const a = new File(['x'], 'a.mp3', { type: 'audio/mpeg' });
    const b = new File(['x'], 'a.mp3', { type: 'audio/mpeg' });
    const c = new File(['y'], 'a.mp3', { type: 'audio/mpeg' });
    expect(await isSameFile(a, b)).toBe(true);
    expect(await isSameFile(a, c)).toBe(false);
  });
});

describe('titleTypeKey', () => {
  it('joins title and media type', () => {
    expect(titleTypeKey('lesson', 'audio')).toBe('lesson::audio');
  });
});
