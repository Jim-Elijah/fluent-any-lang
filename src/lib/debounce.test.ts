import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debounce } from './debounce.js';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays invocation until wait elapses', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('invokes immediately with leading option', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    debounced();
    expect(fn).toHaveBeenCalledTimes(1);

    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush invokes pending call immediately', () => {
    const fn = vi.fn((value: string) => value.length);
    const debounced = debounce(fn, 100);

    debounced('arg');
    expect(debounced.flush()).toBe(3);
    expect(fn).toHaveBeenCalledWith('arg');

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel clears pending invocation', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes on maxWait even when calls continue', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100, { maxWait: 150 });

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('supports trailing: false without a trailing invoke', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    debounced();
    expect(fn).toHaveBeenCalledTimes(1);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush returns the last result when no timer is pending', () => {
    const fn = vi.fn((value: number) => value * 2);
    const debounced = debounce(fn, 100, { leading: true, trailing: false });

    debounced(2);
    expect(debounced.flush()).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('invokes on maxWait even when calls continue', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100, { maxWait: 150 });

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reschedules the timer while maxWait is active', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100, { maxWait: 200 });

    debounced('a');
    vi.advanceTimersByTime(50);
    debounced('b');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledWith('b');
  });
});
