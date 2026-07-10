import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { throttle } from './util.js';

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes at most once per wait window', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancel clears pending trailing invocation', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush invokes pending call immediately', () => {
    const fn = vi.fn((value: number) => value * 2);
    const throttled = throttle(fn, 100);

    throttled(3);
    throttled(4);
    expect(throttled.flush()).toBe(8);
    expect(fn).toHaveBeenCalledWith(4);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
