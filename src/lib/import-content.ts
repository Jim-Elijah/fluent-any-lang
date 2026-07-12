import {
  getMedia,
  getMediaListByTitle,
  getSubtitle,
  addMedia,
  updateMedia,
  deleteMedia,
  addSubtitle,
  deleteSubtitle,
} from '../db/service.js';
import {
  durationsMatch,
  getBaseName,
  getMediaDuration,
  getMediaType,
  hashAny,
  hashFile,
  hashString,
  isAudioFile,
  isLrcFile,
  isSameMediaContent,
  isSrtFile,
  isVideoFile,
  mediaSizesMatch,
  resolveMimeType,
  titleFromFileName,
  titleTypeKey,
  validateMediaFile,
} from './file-validation.js';
import { validateSrtContent, validateLrcContent } from './srt-parser.js';
import type {
  ConflictDecision,
  ImportConflict,
  ImportError,
  ImportOptions,
  ImportResult,
  MediaBlob,
  MediaItem,
  SubtitleSegment,
  SubtitleTrack,
  SubtitleType,
} from '../types/models.js';
import { msg, str } from '@lit/localize';

export type FileGroup = {
  baseName: string;
  audio?: File;
  video?: File;
  srt?: File;
  lrc?: File;
};

type GroupImportResult = {
  importedMedia: MediaItem[];
  /** 供字幕挂载的首选媒体（同组有 video 时优先 video） */
  primaryMedia?: MediaItem;
  subtitles?: SubtitleTrack;
  errors: ImportError[];
  skipped: ImportError[];
  conflicts: ImportConflict[];
};

function toOverwriteSet(values?: string[]): Set<string> {
  return new Set(values ?? []);
}

/**
 * 将用户冲突选择转为 importContentFiles 的 overwrite 选项。
 * 全部跳过时返回 null（无需二次导入）。
 */
export function buildOverwriteOptions(decisions: ConflictDecision[]): ImportOptions | null {
  const overwriteMediaIds = new Set<string>();
  const overwriteTitleTypes = new Set<string>();
  const overwriteSubtitleMediaIds = new Set<string>();

  for (const { conflict, overwrite } of decisions) {
    if (!overwrite) {
      continue;
    }

    if (conflict.kind === 'media-content') {
      overwriteMediaIds.add(conflict.existingMediaId);
    } else if (conflict.kind === 'media-title' && conflict.title && conflict.mediaType) {
      overwriteTitleTypes.add(titleTypeKey(conflict.title, conflict.mediaType));
    } else if (conflict.kind === 'subtitle-content') {
      overwriteSubtitleMediaIds.add(conflict.existingMediaId);
    }
  }

  if (
    overwriteMediaIds.size === 0 &&
    overwriteTitleTypes.size === 0 &&
    overwriteSubtitleMediaIds.size === 0
  ) {
    return null;
  }

  return {
    overwriteMediaIds: [...overwriteMediaIds],
    overwriteTitleTypes: [...overwriteTitleTypes],
    overwriteSubtitleMediaIds: [...overwriteSubtitleMediaIds],
  };
}

/**
 * 将同批文件按 basename 分组（媒体 + 匹配字幕配对）。
 * 同组可同时有 audio 与 video（按 media.type 区分）。
 */
export function groupFiles(files: File[]): { groups: FileGroup[]; errors: ImportError[] } {
  const groups = new Map<string, FileGroup>();
  const errors: ImportError[] = [];

  for (const file of files) {
    if (isAudioFile(file)) {
      const baseName = getBaseName(file.name);
      const group = groups.get(baseName) ?? { baseName };
      if (group.audio) {
        errors.push({
          filename: file.name,
          message: msg(str`同一标题「${baseName}」已存在重复的音频文件`),
        });
        continue;
      }
      group.audio = file;
      groups.set(baseName, group);
      continue;
    }

    if (isVideoFile(file)) {
      const baseName = getBaseName(file.name);
      const group = groups.get(baseName) ?? { baseName };
      if (group.video) {
        errors.push({
          filename: file.name,
          message: msg(str`同一标题「${baseName}」已存在重复的视频文件`),
        });
        continue;
      }
      group.video = file;
      groups.set(baseName, group);
      continue;
    }

    const subtitleType = isSrtFile(file) ? 'srt' : isLrcFile(file) ? 'lrc' : undefined;
    if (subtitleType) {
      const baseName = getBaseName(file.name);
      const group = groups.get(baseName) ?? { baseName };
      if (group[subtitleType]) {
        errors.push({
          filename: file.name,
          message: msg(str`同一标题「${baseName}」已存在重复的 ${subtitleType} 文件`),
        });
        continue;
      }
      group[subtitleType] = file;
      groups.set(baseName, group);
      continue;
    }

    errors.push({
      filename: file.name,
      message: msg('不支持的文件类型'),
    });
  }

  return { groups: [...groups.values()], errors };
}

async function buildSubtitleTrack(
  file: File,
  mediaId: string,
  type: SubtitleType,
  segments: SubtitleSegment[],
  contentHash: string,
): Promise<SubtitleTrack> {
  return {
    id: await hashAny(`${mediaId}:${file.name}`),
    mediaId,
    title: titleFromFileName(file.name),
    filename: file.name,
    type,
    contentHash,
    segments,
  };
}

async function parseSubtitleFile(
  file: File,
  type: SubtitleType,
): Promise<{ segments?: SubtitleSegment[]; contentHash?: string; error?: string }> {
  const text = await file.text();
  const contentHash = await hashString(text);
  if (type === 'srt') {
    const validation = validateSrtContent(text);
    return {
      segments: validation.segments ?? undefined,
      contentHash,
      error: validation.error,
    };
  }
  const validation = validateLrcContent(text);
  return {
    segments: validation.segments ?? undefined,
    contentHash,
    error: validation.error,
  };
}

async function saveOrConflictSubtitle(
  file: File,
  type: SubtitleType,
  mediaId: string,
  segments: SubtitleSegment[],
  contentHash: string,
  overwriteSubtitleMediaIds: Set<string>,
): Promise<Pick<GroupImportResult, 'subtitles' | 'skipped' | 'conflicts' | 'errors'>> {
  const result: Pick<GroupImportResult, 'subtitles' | 'skipped' | 'conflicts' | 'errors'> = {
    errors: [],
    skipped: [],
    conflicts: [],
  };

  const existing = await getSubtitle(mediaId);
  const next = await buildSubtitleTrack(file, mediaId, type, segments, contentHash);

  if (existing) {
    if (existing.contentHash && existing.contentHash === contentHash) {
      result.skipped.push({
        filename: file.name,
        message: msg('字幕已存在且内容相同，已跳过'),
      });
      return result;
    }

    if (!overwriteSubtitleMediaIds.has(mediaId)) {
      result.conflicts.push({
        kind: 'subtitle-content',
        filename: file.name,
        message: msg('该媒体已有不同内容的字幕，选择覆盖将替换原字幕'),
        existingMediaId: mediaId,
      });
      return result;
    }

    await deleteSubtitle(mediaId);
  }

  await addSubtitle(next);
  result.subtitles = next;
  return result;
}

async function readMediaDuration(
  mediaFile: File,
  mimeType: string,
): Promise<{ duration?: number; error?: string }> {
  try {
    return { duration: await getMediaDuration(mediaFile, mimeType) };
  } catch {
    return { error: msg('无法读取媒体时长') };
  }
}

async function importMediaFile(
  mediaFile: File,
  hasSubtitlesFromBatch: boolean,
  options: {
    overwriteMediaIds: Set<string>;
    overwriteTitleTypes: Set<string>;
  },
): Promise<{
  media?: MediaItem;
  mediaImported: boolean;
  errors: ImportError[];
  skipped: ImportError[];
  conflicts: ImportConflict[];
}> {
  const result: {
    media?: MediaItem;
    mediaImported: boolean;
    errors: ImportError[];
    skipped: ImportError[];
    conflicts: ImportConflict[];
  } = {
    errors: [],
    skipped: [],
    conflicts: [],
    mediaImported: false,
  };

  const mediaValidation = validateMediaFile(mediaFile);
  if (!mediaValidation.valid) {
    result.errors.push({
      filename: mediaFile.name,
      message: mediaValidation.error ?? msg('无效的媒体文件'),
    });
    return result;
  }

  const mimeType = resolveMimeType(mediaFile);
  const id = await hashAny(mediaFile.name);
  const title = titleFromFileName(mediaFile.name);
  const type = getMediaType(mimeType);
  const size = mediaFile.size;

  const existingById = await getMedia(id);

  /** 仅在确认需要写库或进一步判重时再取 duration / contentHash */
  const resolveDurationAndHash = async (): Promise<
    { duration: number; contentHash: string } | { error: string }
  > => {
    const durationResult = await readMediaDuration(mediaFile, mimeType);
    if (durationResult.error || durationResult.duration === undefined) {
      return { error: durationResult.error ?? msg('无法读取媒体时长') };
    }
    return {
      duration: durationResult.duration,
      contentHash: await hashFile(mediaFile),
    };
  };

  const saveMedia = async (
    duration: number,
    contentHash: string,
    hasSubtitles: boolean,
  ): Promise<MediaItem> => {
    const mediaItem: MediaItem = {
      id,
      title,
      type,
      mimeType,
      duration,
      filename: mediaFile.name,
      size,
      contentHash,
      createdAt: Date.now(),
      hasSubtitles,
    };
    const mediaBlob: MediaBlob = { mediaId: id, blob: mediaFile };
    await addMedia(mediaItem, mediaBlob);
    return mediaItem;
  };

  if (existingById) {
    const allowOverwrite = options.overwriteMediaIds.has(id);

    // 1) size 不同 → 必为不同内容，无需 duration / hash
    if (!mediaSizesMatch(existingById, { size })) {
      if (!allowOverwrite) {
        result.conflicts.push({
          kind: 'media-content',
          filename: mediaFile.name,
          message: msg('已存在同名媒体且内容不同。覆盖将替换媒体文件；练习记录不会自动迁移'),
          existingMediaId: id,
          title,
          mediaType: type,
        });
        return result;
      }
      const resolved = await resolveDurationAndHash();
      if ('error' in resolved) {
        result.errors.push({ filename: mediaFile.name, message: resolved.error });
        return result;
      }
      result.media = await saveMedia(
        resolved.duration,
        resolved.contentHash,
        hasSubtitlesFromBatch || existingById.hasSubtitles,
      );
      result.mediaImported = true;
      return result;
    }

    // 2) size 相同 → 再取 duration（metadata，远小于整文件 hash）
    const durationResult = await readMediaDuration(mediaFile, mimeType);
    if (durationResult.error || durationResult.duration === undefined) {
      result.errors.push({
        filename: mediaFile.name,
        message: durationResult.error ?? msg('无法读取媒体时长'),
      });
      return result;
    }
    const duration = durationResult.duration;

    // 3) duration 不同 → 不同内容，无需 hash
    if (!durationsMatch(existingById.duration, duration)) {
      if (!allowOverwrite) {
        result.conflicts.push({
          kind: 'media-content',
          filename: mediaFile.name,
          message: msg('已存在同名媒体且内容不同。覆盖将替换媒体文件；练习记录不会自动迁移'),
          existingMediaId: id,
          title,
          mediaType: type,
        });
        return result;
      }
      const contentHash = await hashFile(mediaFile);
      result.media = await saveMedia(
        duration,
        contentHash,
        hasSubtitlesFromBatch || existingById.hasSubtitles,
      );
      result.mediaImported = true;
      return result;
    }

    // 4) size + duration 均相同 → 才算 contentHash 确认
    const contentHash = await hashFile(mediaFile);
    const candidate = { id, size, duration, contentHash };
    if (isSameMediaContent(existingById, candidate)) {
      result.skipped.push({
        filename: mediaFile.name,
        message: msg('媒体已存在且内容相同，已跳过'),
      });
      result.media = {
        ...existingById,
        hasSubtitles: existingById.hasSubtitles || hasSubtitlesFromBatch,
      };
      return result;
    }

    if (!allowOverwrite) {
      result.conflicts.push({
        kind: 'media-content',
        filename: mediaFile.name,
        message: msg('已存在同名媒体且内容不同。覆盖将替换媒体文件；练习记录不会自动迁移'),
        existingMediaId: id,
        title,
        mediaType: type,
      });
      return result;
    }

    result.media = await saveMedia(
      duration,
      contentHash,
      hasSubtitlesFromBatch || existingById.hasSubtitles,
    );
    result.mediaImported = true;
    return result;
  }

  const sameTitle = (await getMediaListByTitle(title)).filter((item) => item.type === type);
  if (sameTitle.length > 0) {
    const existing = sameTitle[0]!;
    const key = titleTypeKey(title, type);
    if (!options.overwriteTitleTypes.has(key)) {
      result.conflicts.push({
        kind: 'media-title',
        filename: mediaFile.name,
        message: msg(
          str`已存在同标题「${title}」的${type === 'video' ? '视频' : '音频'}（${existing.filename}）。覆盖将删除旧文件；练习记录不会自动迁移`,
        ),
        existingMediaId: existing.id,
        title,
        mediaType: type,
      });
      return result;
    }

    await deleteSubtitle(existing.id);
    await deleteMedia(existing.id);
  }

  const resolved = await resolveDurationAndHash();
  if ('error' in resolved) {
    result.errors.push({ filename: mediaFile.name, message: resolved.error });
    return result;
  }

  result.media = await saveMedia(resolved.duration, resolved.contentHash, hasSubtitlesFromBatch);
  result.mediaImported = true;
  return result;
}

async function importGroup(group: FileGroup, options: ImportOptions): Promise<GroupImportResult> {
  const overwriteMediaIds = toOverwriteSet(options.overwriteMediaIds);
  const overwriteTitleTypes = toOverwriteSet(options.overwriteTitleTypes);
  const overwriteSubtitleMediaIds = toOverwriteSet(options.overwriteSubtitleMediaIds);

  const retResult: GroupImportResult = {
    importedMedia: [],
    errors: [],
    skipped: [],
    conflicts: [],
  };

  const mediaFiles = [group.audio, group.video].filter((file): file is File => !!file);
  const srtFile = group.srt;
  const lrcFile = group.lrc;

  if (mediaFiles.length === 0 && !srtFile && !lrcFile) {
    retResult.errors.push({
      filename: group.baseName,
      message: msg('缺少媒体文件及 .srt/.lrc 字幕文件'),
    });
    return retResult;
  }

  const resolvedMedia: MediaItem[] = [];

  for (const mediaFile of mediaFiles) {
    const mediaResult = await importMediaFile(mediaFile, false, {
      overwriteMediaIds,
      overwriteTitleTypes,
    });
    retResult.errors.push(...mediaResult.errors);
    retResult.skipped.push(...mediaResult.skipped);
    retResult.conflicts.push(...mediaResult.conflicts);
    if (mediaResult.media) {
      resolvedMedia.push(mediaResult.media);
      if (mediaResult.mediaImported) {
        retResult.importedMedia.push(mediaResult.media);
      }
    }
  }

  // 同组有视频时字幕优先挂视频，否则挂音频
  const primaryMedia = resolvedMedia.find((item) => item.type === 'video') ?? resolvedMedia[0];
  retResult.primaryMedia = primaryMedia;

  const subtitleFile = srtFile ?? lrcFile;
  const subtitleType: SubtitleType | undefined = srtFile ? 'srt' : lrcFile ? 'lrc' : undefined;

  if (subtitleFile && subtitleType) {
    const parsed = await parseSubtitleFile(subtitleFile, subtitleType);
    if (!parsed.segments || !parsed.contentHash) {
      retResult.errors.push({
        filename: subtitleFile.name,
        message: parsed.error ?? msg('无效的 SRT/LRC 文件'),
      });
    } else if (parsed.segments.length === 0) {
      retResult.errors.push({
        filename: subtitleFile.name,
        message: msg('字幕文件没有有效片段'),
      });
    } else {
      let targetMediaId = primaryMedia?.id;

      if (!targetMediaId) {
        const mediaList = await getMediaListByTitle(titleFromFileName(subtitleFile.name));
        if (mediaList.length === 0) {
          retResult.errors.push({
            filename: subtitleFile.name,
            message: msg('请先导入对应的媒体文件'),
          });
        } else if (mediaList.length > 1) {
          retResult.errors.push({
            filename: subtitleFile.name,
            message: msg('同标题存在多个媒体，请将字幕与对应音/视频一并导入'),
          });
        } else {
          targetMediaId = mediaList[0]!.id;
        }
      }

      if (targetMediaId) {
        const subResult = await saveOrConflictSubtitle(
          subtitleFile,
          subtitleType,
          targetMediaId,
          parsed.segments,
          parsed.contentHash,
          overwriteSubtitleMediaIds,
        );
        retResult.errors.push(...subResult.errors);
        retResult.skipped.push(...subResult.skipped);
        retResult.conflicts.push(...subResult.conflicts);
        retResult.subtitles = subResult.subtitles;

        if (subResult.subtitles) {
          const linked = resolvedMedia.find((item) => item.id === targetMediaId);
          if (linked && !linked.hasSubtitles) {
            const updated = { ...linked, hasSubtitles: true };
            await updateMedia(updated);
            const importedIdx = retResult.importedMedia.findIndex((item) => item.id === linked.id);
            if (importedIdx >= 0) {
              retResult.importedMedia[importedIdx] = updated;
            }
            retResult.primaryMedia = updated;
          } else if (!linked) {
            const mediaList = await getMediaListByTitle(titleFromFileName(subtitleFile.name));
            const target = mediaList.find((item) => item.id === targetMediaId);
            if (target && !target.hasSubtitles) {
              await updateMedia({ ...target, hasSubtitles: true });
            }
          }
        }
      }
    }
  }

  // 本次仅媒体：若库中已有该 mediaId 字幕，同步 hasSubtitles
  if (primaryMedia && !retResult.subtitles) {
    const subtitle = await getSubtitle(primaryMedia.id);
    const hasSubtitles = !!(subtitle && subtitle.segments.length > 0);
    if (primaryMedia.hasSubtitles !== hasSubtitles) {
      const updated = { ...primaryMedia, hasSubtitles };
      await updateMedia(updated);
      retResult.primaryMedia = updated;
      const importedIdx = retResult.importedMedia.findIndex((item) => item.id === primaryMedia.id);
      if (importedIdx >= 0) {
        retResult.importedMedia[importedIdx] = updated;
      }
    }
  }

  return retResult;
}

export async function importContentFiles(
  files: File[],
  options: ImportOptions = {},
): Promise<ImportResult> {
  const { groups, errors } = groupFiles(files);
  const imported: Array<MediaItem | SubtitleTrack> = [];
  const skipped: ImportError[] = [];
  const conflicts: ImportConflict[] = [];

  for (const group of groups) {
    const result = await importGroup(group, options);

    errors.push(...result.errors);
    skipped.push(...result.skipped);
    conflicts.push(...result.conflicts);

    imported.push(...result.importedMedia);
    if (result.subtitles) {
      imported.push(result.subtitles);
    }
  }

  return { imported, errors, skipped, conflicts };
}

/**
 * 为指定媒体挂载字幕（不依赖文件名配对）。
 * 用于媒体库 / 练习页「导入字幕」入口。
 */
export async function importSubtitleForMedia(
  mediaId: string,
  file: File,
  options: { overwrite?: boolean } = {},
): Promise<ImportResult> {
  const result: ImportResult = {
    imported: [],
    errors: [],
    skipped: [],
    conflicts: [],
  };

  const media = await getMedia(mediaId);
  if (!media) {
    result.errors.push({
      filename: file.name,
      message: msg('媒体不存在'),
    });
    return result;
  }

  const subtitleType: SubtitleType | undefined = isSrtFile(file)
    ? 'srt'
    : isLrcFile(file)
      ? 'lrc'
      : undefined;

  if (!subtitleType) {
    result.errors.push({
      filename: file.name,
      message: msg('请选择 .srt 或 .lrc 字幕文件'),
    });
    return result;
  }

  const parsed = await parseSubtitleFile(file, subtitleType);
  if (!parsed.segments || !parsed.contentHash) {
    result.errors.push({
      filename: file.name,
      message: parsed.error ?? msg('无效的 SRT/LRC 文件'),
    });
    return result;
  }

  if (parsed.segments.length === 0) {
    result.errors.push({
      filename: file.name,
      message: msg('字幕文件没有有效片段'),
    });
    return result;
  }

  const overwriteSubtitleMediaIds = options.overwrite ? new Set([mediaId]) : new Set<string>();

  const subResult = await saveOrConflictSubtitle(
    file,
    subtitleType,
    mediaId,
    parsed.segments,
    parsed.contentHash,
    overwriteSubtitleMediaIds,
  );

  result.errors.push(...subResult.errors);
  result.skipped.push(...subResult.skipped);
  result.conflicts.push(...subResult.conflicts);

  if (subResult.subtitles) {
    result.imported.push(subResult.subtitles);
    if (!media.hasSubtitles) {
      await updateMedia({ ...media, hasSubtitles: true });
    }
  }

  return result;
}
