/** Whether a value prop is controlled (explicitly provided). */
export function isControlled<T>(prop: T | undefined): prop is T {
  return prop !== undefined;
}

/** Whether an open prop is controlled (boolean explicitly provided). */
export function isControlledOpen(open: boolean | undefined): open is boolean {
  return typeof open === 'boolean';
}

/** Read current state from controlled prop or internal fallback. */
export function readState<T>(prop: T | undefined, internal: T): T {
  return prop !== undefined ? prop : internal;
}

/** Update internal state when uncontrolled; return the new internal value. */
export function writeState<T>(prop: T | undefined, internal: T, next: T): T {
  if (prop === undefined) {
    return next;
  }
  return internal;
}
