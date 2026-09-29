import { PINNABLE_LIBRARY_ROUTE_VALUES, type PinnableLibraryRoute } from '../types/models.js';

export type PinnableLibraryNavItem = {
  key: PinnableLibraryRoute;
  link: string;
  icon: string;
};

/** Hub order. Icons match the library hub until the app-nav set is distinct. */
export const PINNABLE_LIBRARY_NAV: readonly PinnableLibraryNavItem[] =
  PINNABLE_LIBRARY_ROUTE_VALUES.map((key) => {
    switch (key) {
      case 'library-media':
        return { key, link: '/library/media', icon: 'media' };
      case 'library-playlists':
        return { key, link: '/library/playlists', icon: 'playlist' };
      case 'library-sentences':
        return { key, link: '/library/sentences', icon: 'dialog' };
      case 'library-records':
        return { key, link: '/library/records', icon: 'recording-file' };
    }
  });

const LIBRARY_FAMILY_ROUTES = new Set<string>([
  'library',
  'library-media',
  'library-records',
  'library-noise',
  'library-playlists',
  'library-sentences',
  'playlists',
  'sentences',
]);

/**
 * Most specific app-nav key for the current route.
 * A pinned library page (and sentence practice when 句库 is pinned) wins over 库.
 */
export function resolveLibraryNavKey(route: string, pinned: readonly string[]): string {
  const sentencesPinned = pinned.includes('library-sentences');
  if (
    sentencesPinned &&
    (route === 'sentence-practice' || route === 'library-sentences' || route === 'sentences')
  ) {
    return 'library-sentences';
  }
  if (pinned.includes(route)) return route;
  if (LIBRARY_FAMILY_ROUTES.has(route)) return 'library';
  return route || 'home';
}
