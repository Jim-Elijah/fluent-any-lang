import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DeadlineScheduler } from './deadline-scheduler.js';

describe('DeadlineScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onFire when the deadline elapses', () => {
    const onFire = vi.fn();
    const scheduler = new DeadlineScheduler();
    scheduler.start({ endsAt: Date.now() + 1000, onFire });

    expect(scheduler.isActive).toBe(true);
    vi.advanceTimersByTime(999);
    expect(onFire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(scheduler.isActive).toBe(false);
  });

  it('fires immediately when endsAt is already past', () => {
    const onFire = vi.fn();
    const scheduler = new DeadlineScheduler();
    scheduler.start({ endsAt: Date.now() - 10, onFire });
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(scheduler.isActive).toBe(false);
  });

  it('invokes onTick after start and on each interval', () => {
    const onTick = vi.fn();
    const scheduler = new DeadlineScheduler();
    scheduler.start({
      endsAt: Date.now() + 3000,
      onFire: vi.fn(),
      onTick,
      tickIntervalMs: 1000,
    });

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick.mock.calls[0]?.[0]).toBe(3000);

    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(onTick.mock.calls[1]?.[0]).toBe(2000);
  });

  it('clear prevents a pending fire', () => {
    const onFire = vi.fn();
    const scheduler = new DeadlineScheduler();
    scheduler.start({ endsAt: Date.now() + 500, onFire });
    scheduler.clear();

    vi.advanceTimersByTime(1000);
    expect(onFire).not.toHaveBeenCalled();
    expect(scheduler.isActive).toBe(false);
  });

  it('sync fires when the deadline was missed while timers were stalled', () => {
    const now = vi.fn(() => 1_000);
    const onFire = vi.fn();
    const scheduler = new DeadlineScheduler({ now, autoVisibility: false });
    scheduler.start({ endsAt: 1_500, onFire });

    now.mockReturnValue(2_000);
    scheduler.sync();
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('resyncs and fires on visibilitychange when becoming visible past deadline', () => {
    const now = vi.fn(() => 1_000);
    const onFire = vi.fn();
    const scheduler = new DeadlineScheduler({ now });
    scheduler.start({ endsAt: 1_500, onFire });

    now.mockReturnValue(2_000);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does not sync while the document is hidden', () => {
    const now = vi.fn(() => 1_000);
    const onFire = vi.fn();
    const scheduler = new DeadlineScheduler({ now });
    scheduler.start({ endsAt: 1_500, onFire });

    now.mockReturnValue(2_000);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onFire).not.toHaveBeenCalled();
  });

  it('can be restarted after firing', () => {
    const onFire = vi.fn();
    const scheduler = new DeadlineScheduler();
    scheduler.start({ endsAt: Date.now() + 100, onFire });
    vi.advanceTimersByTime(100);
    expect(onFire).toHaveBeenCalledTimes(1);

    scheduler.start({ endsAt: Date.now() + 200, onFire });
    vi.advanceTimersByTime(200);
    expect(onFire).toHaveBeenCalledTimes(2);
  });
});
