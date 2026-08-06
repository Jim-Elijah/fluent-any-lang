import { msg } from '@lit/localize';

/** Microphone availability for recording UI and guards. */
export type MicrophoneStatus = 'unsupported' | 'granted' | 'denied' | 'prompt' | 'unavailable';

const CACHE_TTL_MS = 20_000;

const AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
} as const;

let cached: { status: MicrophoneStatus; at: number } | null = null;

function statusFromGetUserMediaError(error: unknown): MicrophoneStatus {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'denied';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'unavailable';
  }
  return 'unavailable';
}

async function probeMicrophoneAvailability(): Promise<MicrophoneStatus> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
    });
    stream.getTracks().forEach((track) => track.stop());
    return 'granted';
  } catch (error) {
    return statusFromGetUserMediaError(error);
  }
}

/** User-facing message for getUserMedia / recorder init failures. */
export function getMicrophoneErrorMessage(error: Error): string {
  const name = error.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return msg('未能开启麦克风，请检查权限。');
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return msg('未检测到可用麦克风。');
  }
  return msg('录音失败，请重试。');
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function canRecordWithMicrophone(status: MicrophoneStatus): boolean {
  return status === 'granted' || status === 'prompt';
}

export function invalidateMicrophoneStatusCache(): void {
  cached = null;
}

/**
 * Check whether the user can record. Uses Permissions API when available;
 * probes with getUserMedia only when `force` is true or permission is already granted.
 */
export async function checkMicrophoneStatus(
  options: { force?: boolean } = {},
): Promise<MicrophoneStatus> {
  if (!isRecordingSupported()) {
    return 'unsupported';
  }

  const now = Date.now();
  if (!options.force && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.status;
  }

  const setCache = (status: MicrophoneStatus): MicrophoneStatus => {
    cached = { status, at: now };
    return status;
  };

  try {
    const result = await navigator.permissions?.query({
      name: 'microphone' as PermissionName,
    });
    const permissionState: PermissionState | null = result?.state ?? null;
    if (permissionState === 'denied') {
      return setCache('denied');
    }
    if (permissionState === 'granted') {
      return setCache(await probeMicrophoneAvailability());
    }
  } catch {
    return setCache('unavailable');
  }

  if (!options.force) {
    // Unknown or not-yet-requested permission: enable UI, ask on record.
    return setCache('prompt');
  }

  return setCache(await probeMicrophoneAvailability());
}
