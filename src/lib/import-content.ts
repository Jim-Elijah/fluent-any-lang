import {
  getMediaListByTitle,
  getSubtitle,
  addMedia,
  updateMedia,
  addSubtitle,
} from '../db/service.js';
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
import type {
  ImportError,
  ImportResult,
  MediaBlob,
  MediaItem,
  SubtitleTrack,
} from '../types/models.js';

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
      /** @TODO v2. 支持同时上传 a.mp3 a.mp4, 及细分media.type */
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

async function importGroup(
  group: FileGroup,
): Promise<{ media?: MediaItem; subtitles?: SubtitleTrack; error?: ImportError }> {
  const mediaFile = group.media;
  const srtFile = group.srt;
  const retResult: { media?: MediaItem; subtitles?: SubtitleTrack } = {};
  let mediaItem: MediaItem | undefined = undefined;
  let subtitles: SubtitleTrack | undefined = undefined;
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

    if (subtitles) {
      await addSubtitle(subtitles);
      retResult.subtitles = subtitles;
    }
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

    if (mediaItem) {
      const mediaBlob: MediaBlob = { mediaId: mediaItem.id, blob: mediaFile };
      await addMedia(mediaItem, mediaBlob);
      retResult.media = mediaItem;
    }
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
    const mediaList = await getMediaListByTitle(subtitles.title);
    console.log('只有srt');
    // 上传srt之前就有media, 更新media的hasSubtitles
    if (mediaList.length) {
      console.log('222', mediaList);
      await Promise.all(
        mediaList
          .filter((media) => !media?.hasSubtitles)
          .map((media) => updateMedia({ ...media!, hasSubtitles: true })),
      );
    }
  }
  return retResult;
}

export async function importContentFiles(files: File[]): Promise<ImportResult> {
  /** @TODO 重复文件上传的handle */
  const { groups, errors } = groupFiles(files);
  console.log('groupFiles', groups, errors);
  const imported: Array<MediaItem | SubtitleTrack> = [];

  for (const group of groups) {
    const result = await importGroup(group);
    console.log('importGroup res', result);

    Object.entries(result).forEach(([key, value]) => {
      if (!value) {
        return;
      }
      if (key === 'error') {
        errors.push(value as ImportError);
      } else {
        imported.push(value as MediaItem | SubtitleTrack);
      }
    });
  }
  console.log('importContentFiles res', imported);

  return { imported, errors };
}
