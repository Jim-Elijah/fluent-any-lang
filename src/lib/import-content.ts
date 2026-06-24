import { getMediasByTitle, getSubtitle, saveMedia, updateMedia } from '../db/media-store.js';
import {
  getBaseName,
  getMediaDuration,
  getMediaType,
  hashAny,
  isMediaFile,
  isSrtFile,
  resolveMimeType,
  titleFromFileName,
  validateMediaFile,
} from './file-validation.js';
import { validateSrtContent } from './srt-parser.js';
import type { ImportError, ImportResult, MediaItem, SubtitleTrack } from '../types/models.js';

type FileGroup = {
  baseName: string;
  media?: File;
  srt?: File;
};

function groupFiles(files: File[]): { groups: FileGroup[]; errors: ImportError[] } {
  const groups = new Map<string, FileGroup>();
  const errors: ImportError[] = [];

  for (const file of files) {
    if (isMediaFile(file)) {
      const baseName = getBaseName(file.name);
      const group = groups.get(baseName) ?? { baseName };
      /** @TODO 支持同时上传 a.mp3 a.mp4, 及细分media.type */
      if (group.media) {
        errors.push({
          fileName: file.name,
          message: 'Duplicate media file for the same title',
        });
        continue;
      }
      group.media = file;
      groups.set(baseName, group);
      continue;
    }

    if (isSrtFile(file)) {
      const baseName = getBaseName(file.name);
      const group = groups.get(baseName) ?? { baseName };
      if (group.srt) {
        errors.push({
          fileName: file.name,
          message: 'Duplicate subtitle file for the same title',
        });
        continue;
      }
      group.srt = file;
      groups.set(baseName, group);
      continue;
    }

    errors.push({
      fileName: file.name,
      message: 'Unsupported file type',
    });
  }

  return { groups: [...groups.values()], errors };
}

async function importGroup(group: FileGroup): Promise<{ item?: MediaItem; error?: ImportError }> {
  const mediaFile = group.media;
  const srtFile = group.srt;
  let mediaItem: MediaItem | undefined = undefined;
  let subtitles: SubtitleTrack | undefined = undefined;
  /** @TODO 支持不同时上传media和srt */
  // media和.srt都不存在
  if (!mediaFile && !srtFile) {
    console.log('none exist');
    return {
      error: {
        fileName: group.baseName,
        message: 'Missing media file and .srt file',
      },
    };
  }

  // .srt存在
  if (srtFile) {
    console.log('srtFile exist');
    const srtText = await srtFile.text();
    const srtValidation = validateSrtContent(srtText);
    if (!srtValidation.segments) {
      return {
        error: {
          fileName: srtFile.name,
          message: srtValidation.error ?? 'Invalid SRT file',
        },
      };
    }

    let segments: SubtitleTrack['segments'] = srtValidation.segments;
    let subtitleId: string = await hashAny(srtFile.name);
    subtitles =
      segments.length > 0
        ? {
            id: subtitleId,
            // mediaId: item.id,
            title: titleFromFileName(srtFile.name),
            segments,
          }
        : undefined;
  }

  // media存在
  if (mediaFile) {
    console.log('mediaFile exist');
    const mediaValidation = validateMediaFile(mediaFile);
    if (!mediaValidation.valid) {
      return {
        error: {
          fileName: mediaFile.name,
          message: mediaValidation.error ?? 'Invalid media file',
        },
      };
    }

    const mimeType = resolveMimeType(mediaFile);
    let duration: number;

    try {
      duration = await getMediaDuration(mediaFile, mimeType);
    } catch {
      return {
        error: {
          fileName: mediaFile.name,
          message: 'Unable to read media duration',
        },
      };
    }
    const id = await hashAny(mediaFile.name);
    mediaItem = {
      id,
      title: titleFromFileName(mediaFile.name),
      type: getMediaType(mimeType),
      mimeType,
      duration,
      createdAt: Date.now(),
      hasSubtitles: !!(subtitles && subtitles.segments.length > 0),
    };
  }

  if (mediaItem || mediaFile || subtitles) {
    await saveMedia(mediaItem, mediaFile, subtitles);
  }
  // 本次上传只有media
  if (mediaItem && !subtitles) {
    const subtitle = await getSubtitle(mediaItem.title);
    console.log('只有media');
    // 上传media之前就有subtitle
    if (subtitle) {
      console.log('111');
      mediaItem.hasSubtitles = !!subtitle.segments.length;
      await updateMedia(mediaItem);
    }
  }
  // 本次上传只有srt
  if (subtitles && !mediaItem) {
    const mediaList = await getMediasByTitle(subtitles.title);
    console.log('只有srt');
    // 上传srt之前就有media, 更新media的hasSubtitles
    if (mediaList.length) {
      console.log('222');
      await Promise.all(
        mediaList.filter((media) => !media?.hasSubtitles).map((media) => updateMedia(media!)),
      );
    }
  }
  return { item: mediaItem };
}

export async function importContentFiles(files: File[]): Promise<ImportResult> {
  /** @TODO 重复文件上传的handle */
  const { groups, errors } = groupFiles(files);
  console.log('groupFiles', groups, errors);
  const imported: MediaItem[] = [];

  for (const group of groups) {
    const result = await importGroup(group);
    if (result.item) {
      imported.push(result.item);
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return { imported, errors };
}
