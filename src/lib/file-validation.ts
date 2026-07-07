import { msg } from '@lit/localize';
import type { MediaType } from '../types/models.js';

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'webm', 'm4a', 'aac', 'flac']);

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'ogv']);

const MEDIA_EXTENSIONS = new Set([...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]);

const AUDIO_MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  ogv: 'video/ogg',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ...AUDIO_MIME_BY_EXTENSION,
  ...VIDEO_MIME_BY_EXTENSION,
};

export function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return '';
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function getBaseName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return fileName;
  }
  return fileName.slice(0, dotIndex);
}

export function resolveMimeType(file: File): string {
  if (file.type) {
    return file.type;
  }

  const extension = getFileExtension(file.name);
  return MIME_BY_EXTENSION[extension] ?? '';
}

export function isMediaFile(file: File): boolean {
  const mimeType = resolveMimeType(file);
  if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
    return true;
  }

  return MEDIA_EXTENSIONS.has(getFileExtension(file.name));
}

export function isAudioFile(file: File): boolean {
  return (
    resolveMimeType(file).startsWith('audio/') || AUDIO_EXTENSIONS.has(getFileExtension(file.name))
  );
}

export function isVideoFile(file: File): boolean {
  return (
    resolveMimeType(file).startsWith('video/') || VIDEO_EXTENSIONS.has(getFileExtension(file.name))
  );
}

export function isSrtFile(file: File): boolean {
  return getFileExtension(file.name) === 'srt';
}

export function isLrcFile(file: File): boolean {
  return getFileExtension(file.name) === 'lrc';
}

export function getMediaType(mimeType: string): MediaType {
  return mimeType.startsWith('video/') ? 'video' : 'audio';
}

export function titleFromFileName(fileName: string): string {
  return getBaseName(fileName).trim() || fileName;
}

export async function hashString(str: string) {
  const dataBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return bufferToHex(hashBuffer);
}

export async function hashFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return bufferToHex(hashBuffer);
}

export function bufferToHex(buffer: ArrayBuffer) {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashAny(target: string | File) {
  if (typeof target === 'string') {
    return hashString(target);
  }
  return hashFile(target);
}

/** @TODO 上传时判断是否已存在 */
export function isSameFile(file1: File, file2: File) {
  return (
    file1.name === file2.name &&
    file1.size === file2.size &&
    file1.type === file2.type &&
    hashAny(file1) == hashAny(file2)
  );
}

export function getMediaDuration(file: Blob, mimeType: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const isVideo = getMediaType(mimeType) === 'video';
    const element = document.createElement(isVideo ? 'video' : 'audio');

    const cleanup = (): void => {
      URL.revokeObjectURL(url);
      element.removeAttribute('src');
      element.load();
    };

    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const duration = element.duration;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('Unable to read media duration'));
        return;
      }
      resolve(duration);
    };
    element.onerror = () => {
      cleanup();
      reject(new Error('Unable to load media file'));
    };
    element.src = url;
  });
}

export function validateMediaFile(file: File): { valid: boolean; error?: string } {
  if (!isMediaFile(file)) {
    return { valid: false, error: msg('不支持的媒体格式') };
  }
  return { valid: true };
}
