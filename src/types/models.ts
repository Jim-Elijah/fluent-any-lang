export type SubtitleSegment = {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  translation?: string;
};

export type MediaType = 'audio' | 'video';

// 音视频的metadata
export type MediaItem = {
  id: string; // 根据filename生成hash，上传时判重
  title: string; // basename
  type: MediaType;
  mimeType: string;
  duration: number;
  createdAt: number;
  hasSubtitles: boolean; // 字幕是否上传，取决于与title同名的SubtitleTrack是否有segments
};

// 音视频的Blob
export type MediaBlob = {
  mediaId: string;
  blob: Blob;
};

export type SubtitleTrack = {
  id: string; // 根据filename生成hash，上传时判重
  title: string; // basename
  // TODO whether or not to add more metadata
  segments: SubtitleSegment[];
};

export type PracticeMode = 'repeat' | 'shadowing';

// 录音的metadata
export type PracticeRecord = {
  id: string; // UUID
  mediaId: string;
  mediaTitle: string;
  mode: 'shadowing';
  mimeType: string;
  duration: number;
  createdAt: number;
  segmentIndex?: number; // 从哪一句开始录音
};

// 录音的Blob
export type PracticeRecordBlob = {
  recordId: string;
  blob: Blob;
};

export type LoopMode = 'none' | 'single' | 'segment' | 'list' | 'shuffle';

export type SleepMode = 'off' | 'minutes' | 'until-end';

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
}

export type AppSettings = {
  maxRecordingsPerMedia: number;
  maxStorageMB: number;
  lowStorageThresholdPercent: number;
  repeatPausePercent: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  maxRecordingsPerMedia: 5,
  maxStorageMB: 200,
  lowStorageThresholdPercent: 10,
  repeatPausePercent: 100,
};

export type ImportError = {
  fileName: string;
  message: string;
};

export type ImportResult = {
  imported: Array<MediaItem | SubtitleTrack>;
  errors: ImportError[];
};
