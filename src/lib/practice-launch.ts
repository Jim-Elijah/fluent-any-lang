import { getMedia, getMediaBlob } from '../db/media.js';
import { getPlaylist } from '../db/playlist.js';
import type { Playlist, PracticeSession } from '../types/models.js';

export type PracticeRouteQuery = {
  mediaId: string;
  playlistId?: string;
};

export type PracticeLoadPlan =
  | { kind: 'single'; mediaId: string }
  | { kind: 'playlist'; playlistId: string; startMediaId?: string };

export type PracticeLaunchFailure = 'no-entry' | 'media-missing' | 'playlist-empty';

/** Media row + blob must exist (same gate as `loadMediaForPlayback`). */
export async function isMediaAvailableForPractice(mediaId: string): Promise<boolean> {
  if (!mediaId) return false;
  const item = await getMedia(mediaId);
  if (!item) return false;
  const blob = await getMediaBlob(mediaId);
  return blob != null;
}

export function isMediaActiveInPlaylist(playlist: Playlist, mediaId: string): boolean {
  return playlist.entries.some((entry) => !entry.removed && entry.mediaId === mediaId);
}

/**
 * Practice URL query for navigation. Drops `playlistId` when the list is missing or no longer contains the media.
 * Returns null when the media cannot be practiced.
 */
export async function resolvePracticeRouteQuery(
  mediaId: string,
  playlistId?: string,
): Promise<PracticeRouteQuery | null> {
  if (!(await isMediaAvailableForPractice(mediaId))) {
    return null;
  }
  const trimmedPlaylistId = playlistId?.trim();
  if (trimmedPlaylistId) {
    const playlist = await getPlaylist(trimmedPlaylistId);
    if (playlist && isMediaActiveInPlaylist(playlist, mediaId)) {
      return { mediaId, playlistId: trimmedPlaylistId };
    }
  }
  return { mediaId };
}

export function practicePathFromQuery(query: PracticeRouteQuery): string {
  const params = new URLSearchParams({ mediaId: query.mediaId });
  if (query.playlistId) {
    params.set('playlistId', query.playlistId);
  }
  return `/practice?${params.toString()}`;
}

/** Most recent session whose media is still available; playlist context resolved per `resolvePracticeRouteQuery`. */
export async function resolveContinuePracticeTarget(
  sessions: PracticeSession[],
): Promise<{ session: PracticeSession; route: PracticeRouteQuery } | null> {
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  for (const session of sorted) {
    if (!session.mediaId) continue;
    const route = await resolvePracticeRouteQuery(session.mediaId, session.playlistId);
    if (route) {
      return { session, route };
    }
  }
  return null;
}

async function playlistHasLoadableMedia(playlistId: string): Promise<boolean> {
  const playlist = await getPlaylist(playlistId);
  if (!playlist) return false;
  for (const entry of playlist.entries) {
    if (entry.removed) continue;
    if (await isMediaAvailableForPractice(entry.mediaId)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve how `/practice` should load tracks from query params.
 * Media missing → cannot practice; stale playlist context → single-media plan.
 */
export async function resolvePracticeLoadPlan(input: {
  mediaId?: string;
  playlistId?: string;
}): Promise<{ plan: PracticeLoadPlan } | { failure: PracticeLaunchFailure }> {
  const mediaId = input.mediaId?.trim() ?? '';
  const playlistId = input.playlistId?.trim() ?? '';

  if (!mediaId && !playlistId) {
    return { failure: 'no-entry' };
  }

  if (mediaId) {
    if (!(await isMediaAvailableForPractice(mediaId))) {
      return { failure: 'media-missing' };
    }
    if (playlistId) {
      const playlist = await getPlaylist(playlistId);
      if (playlist && isMediaActiveInPlaylist(playlist, mediaId)) {
        return { plan: { kind: 'playlist', playlistId, startMediaId: mediaId } };
      }
      return { plan: { kind: 'single', mediaId } };
    }
    return { plan: { kind: 'single', mediaId } };
  }

  if (!(await playlistHasLoadableMedia(playlistId))) {
    return { failure: 'playlist-empty' };
  }
  return { plan: { kind: 'playlist', playlistId } };
}
