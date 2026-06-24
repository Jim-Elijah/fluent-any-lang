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
  imported: MediaItem[];
  errors: ImportError[];
};
