import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MediaControllerSnapshot } from '../controllers/media-controller.js';
import type { PracticeSession } from '../types/models.js';
import { MIN_ACTIVE_MS, PracticeTimeTracker } from './practice-time-tracker.js';

function createFakeController() {
  const listeners = new Map<string, Set<(event?: Event) => void>>();
  let isPlaying = false;

  const controller = {
    getSnapshot: (): Pick<MediaControllerSnapshot, 'isPlaying'> => ({ isPlaying }),
    addEventListener: (type: string, listener: (event?: Event) => void) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: (event?: Event) => void) => {
      listeners.get(type)?.delete(listener);
    },
    setPlaying(next: boolean) {
      isPlaying = next;
      const event = new CustomEvent('state-change', {
        detail: { isPlaying } satisfies Pick<MediaControllerSnapshot, 'isPlaying'>,
      });
      for (const listener of listeners.get('state-change') ?? []) {
        listener(event);
      }
    },
  };

  return controller;
}

describe('PracticeTimeTracker', () => {
  let saved: PracticeSession[];
  let clock: number;
  let wall: number;
  let idSeq: number;
  let controller: ReturnType<typeof createFakeController>;
  let tracker: PracticeTimeTracker;

  beforeEach(() => {
    saved = [];
    clock = 0;
    wall = 1_000_000;
    idSeq = 0;
    controller = createFakeController();
    tracker = new PracticeTimeTracker({
      saveSession: async (session) => {
        saved.push(session);
      },
      now: () => clock,
      wallNow: () => wall,
      createId: () => `id-${++idSeq}`,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  function advance(ms: number) {
    clock += ms;
    wall += ms;
  }

  it('accumulates listening time while playing and flushes on mode change', async () => {
    tracker.attach(controller as never);
    tracker.setMedia('media-1', 'Song');
    tracker.setMode('listening');
    controller.setPlaying(true);
    advance(3_000);
    tracker.setMode('shadowing');

    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({
      mediaId: 'media-1',
      mode: 'listening',
      activeMs: 3_000,
    });
  });

  it('attributes free play on shadowing tab to shadowing, not listening', async () => {
    tracker.attach(controller as never);
    tracker.setMedia('media-1', 'Song');
    tracker.setMode('shadowing');
    controller.setPlaying(true);
    advance(2_500);
    tracker.dispose();

    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.mode).toBe('shadowing');
    expect(saved[0]?.activeMs).toBe(2_500);
  });

  it('counts echoListening as echo even if playing flag lags', async () => {
    tracker.attach(controller as never);
    tracker.setMedia('media-1', 'Song');
    tracker.setMode('echo');
    tracker.setFlags({ echoListening: true });
    advance(2_000);
    tracker.setFlags({ echoListening: false, recording: true });
    advance(1_500);
    tracker.setFlags({ recording: false });
    tracker.dispose();

    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({
      mode: 'echo',
      activeMs: 3_500,
    });
  });

  it('pauses accumulation when document is hidden', async () => {
    tracker.attach(controller as never);
    tracker.setMedia('media-1', 'Song');
    tracker.setMode('listening');
    controller.setPlaying(true);
    advance(1_000);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    advance(5_000);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    advance(1_000);
    tracker.dispose();

    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.activeMs).toBe(2_000);
  });

  it('drops sessions shorter than MIN_ACTIVE_MS', async () => {
    tracker.attach(controller as never);
    tracker.setMedia('media-1', 'Song');
    tracker.setMode('listening');
    controller.setPlaying(true);
    advance(MIN_ACTIVE_MS - 1);
    tracker.dispose();

    await Promise.resolve();
    expect(saved).toHaveLength(0);
  });

  it('flushes previous media before switching tracks', async () => {
    tracker.attach(controller as never);
    tracker.setMedia('media-1', 'A');
    tracker.setMode('listening');
    controller.setPlaying(true);
    advance(2_000);
    tracker.setMedia('media-2', 'B');
    advance(2_000);
    tracker.dispose();

    await vi.waitFor(() => expect(saved).toHaveLength(2));
    expect(saved.map((s) => s.mediaId)).toEqual(['media-1', 'media-2']);
  });

  it('does not accumulate without mediaId', () => {
    tracker.attach(controller as never);
    tracker.setMode('listening');
    controller.setPlaying(true);
    advance(5_000);
    expect(tracker.getDebugState().shouldAccumulate).toBe(false);
    expect(tracker.getDebugState().sessionId).toBeNull();
  });
});
