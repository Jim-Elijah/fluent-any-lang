import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canRecordWithMicrophone,
  checkMicrophoneStatus,
  getMicrophoneErrorMessage,
  invalidateMicrophoneStatusCache,
} from './microphone-access.js';

describe('microphone-access', () => {
  beforeEach(() => {
    invalidateMicrophoneStatusCache();
    vi.stubGlobal('MediaRecorder', { isTypeSupported: vi.fn().mockReturnValue(true) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateMicrophoneStatusCache();
  });

  it('returns unsupported when MediaRecorder is missing', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    await expect(checkMicrophoneStatus({ force: true })).resolves.toBe('unsupported');
  });

  it('returns denied from permissions API without probing', async () => {
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      },
      mediaDevices: { getUserMedia: vi.fn() },
    });

    await expect(checkMicrophoneStatus()).resolves.toBe('denied');
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('returns prompt without probing when permission is still prompt', async () => {
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'prompt' }),
      },
      mediaDevices: { getUserMedia: vi.fn() },
    });

    await expect(checkMicrophoneStatus()).resolves.toBe('prompt');
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('probes when permission is granted and returns unavailable when no device', async () => {
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      },
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('not found', 'NotFoundError')),
      },
    });

    await expect(checkMicrophoneStatus()).resolves.toBe('unavailable');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('probes when permission is granted and returns granted when device works', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      },
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
      },
    });

    await expect(checkMicrophoneStatus()).resolves.toBe('granted');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalled();
  });

  it('returns prompt when permissions API is unavailable', async () => {
    vi.stubGlobal('navigator', {
      permissions: undefined,
      mediaDevices: { getUserMedia: vi.fn() },
    });

    await expect(checkMicrophoneStatus()).resolves.toBe('prompt');
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('probes and returns granted when getUserMedia succeeds', async () => {
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'prompt' }),
      },
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
      },
    });

    await expect(checkMicrophoneStatus({ force: true })).resolves.toBe('granted');
    expect(stop).toHaveBeenCalled();
  });

  it('uses cache until force refresh', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'prompt' }),
      },
      mediaDevices: { getUserMedia },
    });

    await checkMicrophoneStatus({ force: true });
    await checkMicrophoneStatus();
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await checkMicrophoneStatus({ force: true });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('maps NotAllowedError to denied', async () => {
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn().mockRejectedValue(new Error('unsupported')) },
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
      },
    });

    await expect(checkMicrophoneStatus({ force: true })).resolves.toBe('denied');
  });

  it('maps NotFoundError to unavailable message', () => {
    const error = new DOMException('not found', 'NotFoundError');
    expect(getMicrophoneErrorMessage(error)).toContain('未检测到可用麦克风');
  });

  it('maps NotAllowedError to permission message', () => {
    const error = new DOMException('denied', 'NotAllowedError');
    expect(getMicrophoneErrorMessage(error)).toContain('未能开启麦克风');
  });

  it('canRecordWithMicrophone allows prompt and granted', () => {
    expect(canRecordWithMicrophone('granted')).toBe(true);
    expect(canRecordWithMicrophone('prompt')).toBe(true);
    expect(canRecordWithMicrophone('denied')).toBe(false);
  });
});
