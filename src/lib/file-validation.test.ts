import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bufferToHex,
  durationsMatch,
  getBaseName,
  getFileExtension,
  getMediaDuration,
  getMediaType,
  hashAny,
  hashFile,
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

  it('returns empty string for unknown extensions without type', () => {
    expect(resolveMimeType(makeFile('notes.bin'))).toBe('');
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

  it('falls back to the original name when basename is blank', () => {
    expect(titleFromFileName('   .mp3')).toBe('   .mp3');
  });
});

describe('hash helpers', () => {
  it('returns a stable SHA-256 hex digest for strings', async () => {
    const hash = await hashString('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashString('hello')).toBe(hash);
    expect(await hashString('world')).not.toBe(hash);
  });

  it('hashes files and forwards hashAny by input type', async () => {
    const file = new File(['hello'], 'a.mp3', { type: 'audio/mpeg' });
    const fileHash = await hashFile(file);
    expect(fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashAny(file)).toBe(fileHash);
    expect(await hashAny('hello')).toBe(await hashString('hello'));
  });

  it('bufferToHex encodes bytes as lowercase hex', () => {
    expect(bufferToHex(new Uint8Array([0, 15, 255]).buffer)).toBe('000fff');
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

  it('returns false when metadata differs before hashing', async () => {
    const a = new File(['x'], 'a.mp3', { type: 'audio/mpeg' });
    const renamed = new File(['x'], 'b.mp3', { type: 'audio/mpeg' });
    const typed = new File(['x'], 'a.mp3', { type: 'audio/wav' });
    expect(await isSameFile(a, renamed)).toBe(false);
    expect(await isSameFile(a, typed)).toBe(false);
  });
});

describe('titleTypeKey', () => {
  it('joins title and media type', () => {
    expect(titleTypeKey('lesson', 'audio')).toBe('lesson::audio');
  });
});

describe('getMediaDuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves audio duration from loaded metadata', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audio');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const element = {
      preload: '',
      src: '',
      duration: 12.5,
      onloadedmetadata: null as null | (() => void),
      onerror: null as null | (() => void),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(element as unknown as HTMLAudioElement);

    const promise = getMediaDuration(new Blob(['x']), 'audio/mpeg');
    element.onloadedmetadata?.();
    await expect(promise).resolves.toBe(12.5);
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:audio');
    expect(element.removeAttribute).toHaveBeenCalledWith('src');
    expect(element.load).toHaveBeenCalled();
  });

  it('uses a video element for video mime types', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const element = {
      preload: '',
      src: '',
      duration: 3,
      onloadedmetadata: null as null | (() => void),
      onerror: null as null | (() => void),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    };
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(element as unknown as HTMLVideoElement);

    const promise = getMediaDuration(new Blob(['x']), 'video/mp4');
    element.onloadedmetadata?.();
    await expect(promise).resolves.toBe(3);
    expect(createElement).toHaveBeenCalledWith('video');
  });

  it('rejects when duration is non-finite or non-positive', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bad');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const element = {
      preload: '',
      src: '',
      duration: Number.NaN,
      onloadedmetadata: null as null | (() => void),
      onerror: null as null | (() => void),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(element as unknown as HTMLAudioElement);

    const promise = getMediaDuration(new Blob(['x']), 'audio/mpeg');
    element.onloadedmetadata?.();
    await expect(promise).rejects.toThrow('无法读取媒体时长');
  });

  it('rejects when the media element errors', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:err');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const element = {
      preload: '',
      src: '',
      duration: 1,
      onloadedmetadata: null as null | (() => void),
      onerror: null as null | (() => void),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(element as unknown as HTMLAudioElement);

    const promise = getMediaDuration(new Blob(['x']), 'audio/mpeg');
    element.onerror?.();
    await expect(promise).rejects.toThrow('无法加载媒体文件');
  });
});
