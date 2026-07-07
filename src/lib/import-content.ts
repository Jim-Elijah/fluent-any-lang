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
  isAudioFile,
  isLrcFile,
  isSrtFile,
  resolveMimeType,
  titleFromFileName,
  validateMediaFile,
} from './file-validation.js';
import { validateSrtContent, validateLrcContent } from './srt-parser.js';
import type {
  ImportError,
  ImportResult,
  MediaBlob,
  MediaItem,
  SubtitleSegment,
  SubtitleTrack,
} from '../types/models.js';
import { msg, str } from '@lit/localize';

type FileGroup = {
  baseName: string;
  audio?: File;
  // @TODO 支持video/*
  video?: File;
  srt?: File;
  lrc?: File;
};

/**
 * 将文件分组，组内文件的baseName相同
 * @param files 文件列表
 * @returns 分组后的文件列表和错误信息
 * @example
 * groupFiles([new File(['a'], 'a.mp3'), new File(['b'], 'b.mp3')])
 * => { groups: [{ baseName: 'a', audio: new File(['a'], 'a.mp3') }, { baseName: 'b', audio: new File(['b'], 'b.mp3') }], errors: [] }
 */
function groupFiles(files: File[]): { groups: FileGroup[]; errors: ImportError[] } {
  const groups = new Map<string, FileGroup>();
  const errors: ImportError[] = [];

  for (const file of files) {
    /** @TODO 目前media只支持上传音频文件，后期支持视频文件 */
    if (isAudioFile(file)) {
      const baseName = getBaseName(file.name);
      const group = groups.get(baseName) ?? { baseName };
      /** @TODO v2. 支持同时上传 a.mp3 a.mp4, 及细分media.type */
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

async function importGroup(
  group: FileGroup,
): Promise<{ media?: MediaItem; subtitles?: SubtitleTrack; errors?: ImportError[] }> {
  // @TODO 支持视频文件
  const mediaFile = group.audio;
  const srtFile = group.srt;
  const lrcFile = group.lrc;
  const retResult: { media?: MediaItem; subtitles?: SubtitleTrack; errors: ImportError[] } = {
    errors: [],
  };
  let mediaItem: MediaItem | undefined = undefined;
  let subtitles: SubtitleTrack | undefined = undefined;
  // media和.srt都不存在
  if (!mediaFile && !srtFile && !lrcFile) {
    console.log('none exist');
    retResult.errors.push({
      filename: group.baseName,
      message: msg('缺少媒体文件及 .srt/.lrc 字幕文件'),
    });
    return retResult;
  }

  // .srt/.lrc存在
  if (srtFile || lrcFile) {
    // 同时存在时，只处理srt，lrc会被忽略
    if (srtFile) {
      console.log('srt file exist');
      const srtText = await srtFile.text();
      const srtValidation = validateSrtContent(srtText);
      if (!srtValidation.segments) {
        retResult.errors.push({
          filename: srtFile.name,
          message: srtValidation.error ?? msg('无效的 SRT/LRC 文件'),
        });
      } else {
        const segments: SubtitleSegment[] = srtValidation.segments;
        if (segments.length > 0) {
          const subtitleId: string = await hashAny(srtFile.name);
          subtitles = {
            id: subtitleId,
            title: titleFromFileName(srtFile.name),
            filename: srtFile.name,
            type: 'srt',
            segments,
          };
          await addSubtitle(subtitles);
          retResult.subtitles = subtitles;
        }
      }
    } else if (lrcFile) {
      console.log('lrc file exist');
      const lrcText = await lrcFile.text();
      const lrcValidation = validateLrcContent(lrcText);
      if (!lrcValidation.segments) {
        retResult.errors.push({
          filename: lrcFile.name,
          message: lrcValidation.error ?? msg('无效的 SRT/LRC 文件'),
        });
      } else {
        const segments: SubtitleSegment[] = lrcValidation.segments;
        if (segments.length > 0) {
          const subtitleId: string = await hashAny(lrcFile.name);
          subtitles = {
            id: subtitleId,
            title: titleFromFileName(lrcFile.name),
            filename: lrcFile.name,
            type: 'lrc',
            segments,
          };
          await addSubtitle(subtitles);
          retResult.subtitles = subtitles;
        }
      }
    }
  }

  // media存在
  if (mediaFile) {
    console.log('mediaFile exist');
    const mediaValidation = validateMediaFile(mediaFile);
    if (!mediaValidation.valid) {
      retResult.errors.push({
        filename: mediaFile.name,
        message: mediaValidation.error ?? msg('无效的媒体文件'),
      });
    } else {
      const mimeType = resolveMimeType(mediaFile);
      let duration: number;

      try {
        duration = await getMediaDuration(mediaFile, mimeType);
      } catch {
        retResult.errors.push({
          filename: mediaFile.name,
          message: msg('无法读取媒体时长'),
        });
        return retResult;
      }
      const id = await hashAny(mediaFile.name);
      mediaItem = {
        id,
        title: titleFromFileName(mediaFile.name),
        type: getMediaType(mimeType),
        mimeType,
        duration,
        filename: mediaFile.name,
        size: mediaFile.size,
        createdAt: Date.now(),
        hasSubtitles: !!(subtitles && subtitles.segments.length > 0),
      };

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
    console.log('subtitle', subtitle);
    if (subtitle) {
      console.log('111');
      const hasSubtitles = !!subtitle.segments.length;
      if (mediaItem.hasSubtitles !== hasSubtitles) {
        mediaItem.hasSubtitles = hasSubtitles;
        await updateMedia(mediaItem);
      }
    }
  }
  // 本次上传只有subtitle
  if (subtitles && !mediaItem) {
    const mediaList = await getMediaListByTitle(subtitles.title);
    console.log('只有subtitle');
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
      if (key === 'errors') {
        errors.push(...(value as ImportError[]));
      } else {
        imported.push(value as MediaItem | SubtitleTrack);
      }
    });
  }
  console.log('importContentFiles res', imported);

  return { imported, errors };
}
