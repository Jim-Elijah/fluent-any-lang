import { describe, expect, it } from 'vitest';

import { isControlled, isControlledOpen, readState, writeState } from './controlled-state.js';

describe('controlled-state', () => {
  describe('isControlled', () => {
    it('returns true when prop is defined', () => {
      expect(isControlled('value')).toBe(true);
      expect(isControlled(0)).toBe(true);
      expect(isControlled(false)).toBe(true);
    });

    it('returns false when prop is undefined', () => {
      expect(isControlled(undefined)).toBe(false);
    });
  });

  describe('isControlledOpen', () => {
    it('returns true for boolean open prop', () => {
      expect(isControlledOpen(true)).toBe(true);
      expect(isControlledOpen(false)).toBe(true);
    });

    it('returns false when open is undefined', () => {
      expect(isControlledOpen(undefined)).toBe(false);
    });
  });

  describe('readState', () => {
    it('prefers controlled prop over internal state', () => {
      expect(readState('controlled', 'internal')).toBe('controlled');
    });

    it('falls back to internal when prop is undefined', () => {
      expect(readState(undefined, 'internal')).toBe('internal');
    });
  });

  describe('writeState', () => {
    it('returns next when uncontrolled', () => {
      expect(writeState(undefined, 'old', 'new')).toBe('new');
    });

    it('keeps internal when controlled', () => {
      expect(writeState('controlled', 'internal', 'new')).toBe('internal');
    });
  });
});
