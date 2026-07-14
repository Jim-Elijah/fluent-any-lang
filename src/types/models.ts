/** 字幕/歌词片段，时间单位为秒 */
export type SubtitleSegment = {
  id: string;
  startTime: number;
  endTime: number;
  /** 原文 */
  text: string;
  /** 译文（双语字幕/歌词时存在） */
  translation?: string;
};
export type SubtitleType = 'srt' | 'lrc';

export type MediaType = 'audio' | 'video';

// 音视频的metadata
export type MediaItem = {
  id: string; // 根据filename生成hash，上传时判重
  title: string; // basename
  filename: string; // filename
  size: number;
  type: MediaType;
  mimeType: string;
  duration: number;
  createdAt: number;
  /** 文件内容 SHA-256，用于导入判重 */
  contentHash: string;
  /** 该 mediaId 下是否已有字幕 segments */
  hasSubtitles: boolean;
  cover?: string; // 封面图片url
};

// 音视频的Blob
export type MediaBlob = {
  mediaId: string;
  blob: Blob;
};

export type SubtitleTrack = {
  id: string; // hash(mediaId:filename)，与媒体一对一
  mediaId: string;
  title: string; // basename
  filename: string; // filename
  type: SubtitleType; // srt or lrc
  /** 字幕原文 SHA-256，用于导入判重（避免 segment id 随机导致误判） */
  contentHash: string;
  segments: SubtitleSegment[];
};

export type PracticeMode = 'shadowing' | 'echo';

/** 练习时长埋点用的模式（含听力） */
export type PracticeAnalyticsMode = 'listening' | 'shadowing' | 'echo';

/** 一次有效练习会话（写入 IndexedDB） */
export type PracticeSession = {
  id: string;
  mediaId: string;
  mediaTitle: string;
  /** 写入时冗余，媒体删除后仍可区分音/视频 */
  mediaType: MediaType;
  mediaFilename: string;
  mode: PracticeAnalyticsMode;
  startedAt: number;
  endedAt: number;
  activeMs: number;
  /** 本地时区 YYYY-MM-DD，便于按日查询 */
  dateKey: string;
};

// 录音与原始音频每一片段的对应关系，用于对比回放（时间单位为秒）
export type PracticeSegment = {
  id: string; // segment_id
  sourceStartTime: number; // 原始音频起始时间（秒）
  sourceEndTime: number; // 原始音频结束时间（秒）
  recordingStartTime: number; // 录音起始时间（秒）
  recordingEndTime: number; // 录音结束时间（秒）
};

// 录音的metadata
export type PracticeRecord = {
  id: string; // UUID
  mediaId: string;
  mediaTitle: string;
  mediaFilename: string;
  mode: PracticeMode;
  /** echo 模式：对应的字幕句 id，便于按句查询 */
  segmentId?: string;
  mimeType: string;
  createdAt: number;
  sourceDuration: number; // 本次练习覆盖的原音时长（秒），即 segments 首尾在原音时间轴上的跨度
  recordingDuration: number; // 录音时长
  segments: PracticeSegment[];
};

// 录音的Blob
export type PracticeRecordBlob = {
  recordId: string;
  blob: Blob;
};

export type LoopMode = 'none' | 'single' | 'segment' | 'list' | 'shuffle';

export type SleepMode = 'off' | 'minutes' | 'until-end';

export type PauseMode = 'off' | 'seconds' | 'percentage';

/** 播放器布局模式 */
export type MediaPlayerMode = 'normal' | 'fixed' | 'mini';

/**
 * 控制面板各控件的显示配置。
 * 所有字段默认为 true；设为 false 则隐藏对应控件。
 * 注意：previousNextSegment 还需要 snapshot.hasSubtitles 为 true 才会显示。
 */
export interface MediaControlsConfig {
  /** 进度条与时间 */
  progress?: boolean;
  /** 播放 / 暂停按钮 */
  playPause?: boolean;
  /** 上一首 / 下一首 */
  previousNextTrack?: boolean;
  /** 上一句 / 下一句（需同时有字幕才生效） */
  previousNextSegment?: boolean;
  /** 循环模式选择 */
  loopMode?: boolean;
  /** 倍速选择 */
  playbackRate?: boolean;
  /** 音量调节 */
  volume?: boolean;
  /** 睡眠模式 */
  sleepMode?: boolean;
  /** 句间暂停（需同时有字幕才生效） */
  pauseMode?: boolean;
  /** 切换模式 normal fixed mini */
  switchMode?: boolean;
}

/** 路由上下文， 参考 lit-element-router/lit-element-router.d.ts */
export interface RouteContext {
  route: string; // 路由名称
  params: {
    [key: string]: string;
  }; // 路由参数
  query: {
    [key: string]: string;
  }; // 路由查询参数
  data: object; // 路由数据
}

export type AppSettings = {
  maxRecordingsPerMedia: number;
  maxEchoPerSegment: number;
  maxStorageMB: number;
  lowStorageThresholdPercent: number;
  repeatPausePercent: number;
  /** When true, recording countdown overlay is skipped. */
  skipRecordingCountdown: boolean;
  /** When true, shadowing mode tips modal is skipped. */
  skipShadowingTips: boolean;
  /** When true, echo mode tips modal is skipped. */
  skipEchoTips: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  maxRecordingsPerMedia: 5,
  maxEchoPerSegment: 10,
  maxStorageMB: 200,
  lowStorageThresholdPercent: 10,
  repeatPausePercent: 100,
  skipRecordingCountdown: false,
  skipShadowingTips: false,
  skipEchoTips: false,
};

/** Allowed ranges for persisted AppSettings numeric fields. */
export const APP_SETTINGS_LIMITS = {
  maxRecordingsPerMedia: { min: 1, max: 20 },
  maxEchoPerSegment: { min: 1, max: 50 },
  maxStorageMB: { min: 50, max: 2000 },
  lowStorageThresholdPercent: { min: 5, max: 50 },
  repeatPausePercent: { min: 100, max: 500, step: 10 },
} as const;

export type ImportError = {
  filename: string;
  message: string;
};

export type ImportConflictKind = 'media-content' | 'media-title' | 'subtitle-content';

/** 导入冲突：需用户选择覆盖或跳过 */
export type ImportConflict = {
  kind: ImportConflictKind;
  filename: string;
  message: string;
  /** 将被覆盖的已有媒体 id */
  existingMediaId: string;
  title?: string;
  mediaType?: MediaType;
};

export type ImportOptions = {
  /** 同 filename 内容不同时允许覆盖的 media id */
  overwriteMediaIds?: string[];
  /** 同 title+type 不同后缀时允许覆盖，格式 `${title}::${type}` */
  overwriteTitleTypes?: string[];
  /** 允许覆盖字幕的 media id */
  overwriteSubtitleMediaIds?: string[];
};

/** 用户对单条导入冲突的选择 */
export type ConflictDecision = {
  conflict: ImportConflict;
  /** true=覆盖，false=跳过 */
  overwrite: boolean;
};

export type ImportResult = {
  imported: Array<MediaItem | SubtitleTrack>;
  errors: ImportError[];
  skipped: ImportError[];
  conflicts: ImportConflict[];
};

export type SortDirection = 'asc' | 'desc';
