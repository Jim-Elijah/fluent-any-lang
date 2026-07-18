import { msg } from '@lit/localize';

import { addNoise, getNoise, getNoiseByContentHash, getNoiseList } from '../db/noise.js';
import type { NoiseItem } from '../types/models.js';
import {
  durationsMatch,
  getMediaDuration,
  hashAny,
  hashFile,
  isAudioFile,
  resolveMimeType,
  titleFromFileName,
  validateMediaFile,
} from './file-validation.js';

export type NoiseImportError = {
  filename: string;
  message: string;
};

export type NoiseImportResult = {
  imported: NoiseItem[];
  skipped: NoiseImportError[];
  errors: NoiseImportError[];
};

async function importOneNoiseFile(
  file: File,
): Promise<{ ok: true; item: NoiseItem } | { ok: false; kind: 'skip' | 'error'; message: string }> {
  if (!isAudioFile(file)) {
    return { ok: false, kind: 'error', message: msg('仅支持音频文件作为噪音素材') };
  }

  const validation = validateMediaFile(file);
  if (!validation.valid) {
    return { ok: false, kind: 'error', message: validation.error ?? msg('不支持的媒体格式') };
  }

  const mimeType = resolveMimeType(file);
  let duration: number;
  try {
    duration = await getMediaDuration(file, mimeType);
  } catch (error) {
    return {
      ok: false,
      kind: 'error',
      message: error instanceof Error ? error.message : msg('无法读取媒体时长'),
    };
  }

  const contentHash = await hashFile(file);
  const byHash = await getNoiseByContentHash(contentHash);
  if (byHash) {
    return { ok: false, kind: 'skip', message: msg('已存在相同内容的噪音素材') };
  }

  const id = await hashAny(file.name);
  const existingById = await getNoise(id);
  if (existingById) {
    if (
      existingById.size === file.size &&
      durationsMatch(existingById.duration, duration) &&
      existingById.contentHash === contentHash
    ) {
      return { ok: false, kind: 'skip', message: msg('已存在相同内容的噪音素材') };
    }
    // Same filename hash, different content — still allow via contentHash uniqueness on new id.
    // Prefer content-based id when filename collides with different bytes.
  }

  const noiseId = existingById && existingById.contentHash !== contentHash ? contentHash : id;

  // Final guard if we remapped id
  if (noiseId !== id) {
    const collision = await getNoise(noiseId);
    if (collision) {
      return { ok: false, kind: 'skip', message: msg('已存在相同内容的噪音素材') };
    }
  }

  // Also skip if any existing item matches size+duration+hash (belt and suspenders)
  const all = await getNoiseList();
  const sameContent = all.find(
    (item) =>
      item.size === file.size &&
      durationsMatch(item.duration, duration) &&
      item.contentHash === contentHash,
  );
  if (sameContent) {
    return { ok: false, kind: 'skip', message: msg('已存在相同内容的噪音素材') };
  }

  const item: NoiseItem = {
    id: noiseId,
    title: titleFromFileName(file.name),
    filename: file.name,
    size: file.size,
    mimeType,
    duration,
    createdAt: Date.now(),
    contentHash,
  };

  await addNoise(item, { noiseId: item.id, blob: file });
  return { ok: true, item };
}

export async function importNoiseFiles(files: File[]): Promise<NoiseImportResult> {
  const result: NoiseImportResult = { imported: [], skipped: [], errors: [] };

  for (const file of files) {
    try {
      const outcome = await importOneNoiseFile(file);
      if (outcome.ok) {
        result.imported.push(outcome.item);
      } else if (outcome.kind === 'skip') {
        result.skipped.push({ filename: file.name, message: outcome.message });
      } else {
        result.errors.push({ filename: file.name, message: outcome.message });
      }
    } catch (error) {
      result.errors.push({
        filename: file.name,
        message: error instanceof Error ? error.message : msg('导入失败'),
      });
    }
  }

  return result;
}
