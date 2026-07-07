import { debounce } from './debounce.js';

export { debounce } from './debounce.js';
export type { DebounceOptions, DebouncedFunction } from './debounce.js';

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

export interface ThrottledFunction<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  cancel(): void;
  flush(): ReturnType<T> | undefined;
}

/**
 * Creates a throttled function that invokes `func` at most once per `wait` ms.
 * Based on lodash throttle (leading + trailing edges, with `maxWait` = `wait`).
 */
export function throttle<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number,
  options?: ThrottleOptions,
): ThrottledFunction<T> {
  const leading = options?.leading ?? true;
  const trailing = options?.trailing ?? true;

  return debounce(func, wait, {
    leading,
    maxWait: wait,
    trailing,
  });
}
