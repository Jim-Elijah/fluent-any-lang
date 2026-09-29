import { describe, expect, it } from 'vitest';

import { resolveLibraryNavKey } from './library-nav-pins.js';

describe('resolveLibraryNavKey', () => {
  it('highlights the hub for library routes when nothing is pinned', () => {
    expect(resolveLibraryNavKey('library', [])).toBe('library');
    expect(resolveLibraryNavKey('library-media', [])).toBe('library');
    expect(resolveLibraryNavKey('library-noise', [])).toBe('library');
    expect(resolveLibraryNavKey('sentence-practice', [])).toBe('sentence-practice');
    expect(resolveLibraryNavKey('settings', [])).toBe('settings');
  });

  it('highlights a pinned route and leaves unpinned library routes on the hub', () => {
    const pinned = ['library-media', 'library-records'];
    expect(resolveLibraryNavKey('library-media', pinned)).toBe('library-media');
    expect(resolveLibraryNavKey('library-records', pinned)).toBe('library-records');
    expect(resolveLibraryNavKey('library', pinned)).toBe('library');
    expect(resolveLibraryNavKey('library-noise', pinned)).toBe('library');
    expect(resolveLibraryNavKey('library-playlists', pinned)).toBe('library');
    expect(resolveLibraryNavKey('sentence-practice', pinned)).toBe('sentence-practice');
  });

  it('highlights the sentence-bank pin on sentence practice only while that route is pinned', () => {
    expect(resolveLibraryNavKey('sentence-practice', ['library-sentences'])).toBe(
      'library-sentences',
    );
    expect(resolveLibraryNavKey('library-sentences', ['library-sentences'])).toBe(
      'library-sentences',
    );
  });
});
