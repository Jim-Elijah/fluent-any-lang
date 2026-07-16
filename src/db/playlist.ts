import { getDB } from './index.js';
import { STORE_PLAYLIST } from './schema.js';
import type { Playlist, PlaylistEntry } from '../types/models.js';
import { FAVORITES_PLAYLIST_ID } from '../types/models.js';
import { getMedia } from './media.js';
export const PLAYLIST_NAME_CONFLICT_ERROR = 'PLAYLIST_NAME_CONFLICT';

export class PlaylistNameConflictError extends Error {
  code = PLAYLIST_NAME_CONFLICT_ERROR;

  constructor(name: string) {
    super(`Playlist name already exists: ${name}`);
    this.name = 'PlaylistNameConflictError';
  }
}

export function isPlaylistNameConflictError(error: unknown): error is PlaylistNameConflictError {
  return (
    error instanceof PlaylistNameConflictError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === PLAYLIST_NAME_CONFLICT_ERROR)
  );
}

function normalizePlaylistName(name: string): string {
  /** @TODO remove toLocaleLowerCase */
  return name.trim().toLocaleLowerCase();
}

async function assertPlaylistNameAvailable(name: string, excludeId?: string): Promise<void> {
  const normalized = normalizePlaylistName(name);
  if (!normalized) {
    return;
  }

  const all = await getPlaylistList();
  const duplicate = all.find(
    (playlist) => playlist.id !== excludeId && normalizePlaylistName(playlist.name) === normalized,
  );
  if (duplicate) {
    throw new PlaylistNameConflictError(name);
  }
}

/** Ensure favorites playlist exists (called after DB upgrade or tests). */
export async function ensureFavoritesPlaylist(): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_PLAYLIST, FAVORITES_PLAYLIST_ID);
  if (existing) return;

  const favorites: Playlist = {
    id: FAVORITES_PLAYLIST_ID,
    name: '喜欢',
    kind: 'favorites',
    sortOrder: 0,
    entries: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.put(STORE_PLAYLIST, favorites);
}

export async function getPlaylist(id: string): Promise<Playlist | undefined> {
  const db = await getDB();
  return db.get(STORE_PLAYLIST, id);
}

export async function getPlaylistList(): Promise<Playlist[]> {
  const db = await getDB();
  const items = await db.getAllFromIndex(STORE_PLAYLIST, 'bySortOrder');
  return items;
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const db = await getDB();
  const all = await getPlaylistList();
  const normalizedName = name.trim();
  await assertPlaylistNameAvailable(normalizedName);
  const maxOrder = all.reduce((max, p) => Math.max(max, p.sortOrder), 0);

  const newPlaylist: Playlist = {
    id: crypto.randomUUID(),
    name: normalizedName,
    kind: 'user',
    sortOrder: maxOrder + 1,
    entries: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.put(STORE_PLAYLIST, newPlaylist);
  return newPlaylist;
}

export async function updatePlaylist(
  id: string,
  updates: Partial<Pick<Playlist, 'name'>>,
): Promise<Playlist | null> {
  const db = await getDB();
  const existing = await db.get(STORE_PLAYLIST, id);
  if (!existing) return null;

  const nextName = typeof updates.name === 'string' ? updates.name.trim() : undefined;
  if (nextName != null && nextName !== existing.name) {
    await assertPlaylistNameAvailable(nextName, id);
  }

  const updated: Playlist = {
    ...existing,
    ...updates,
    ...(nextName != null ? { name: nextName } : {}),
    updatedAt: Date.now(),
  };
  await db.put(STORE_PLAYLIST, updated);
  return updated;
}

export async function deletePlaylist(id: string): Promise<boolean> {
  if (id === FAVORITES_PLAYLIST_ID) {
    throw new Error('Cannot delete favorites playlist');
  }
  const db = await getDB();
  const existing = await db.get(STORE_PLAYLIST, id);
  if (!existing) return false;

  await db.delete(STORE_PLAYLIST, id);
  return true;
}

/** Reorder playlists by the given ids array (favorites must be first). */
export async function reorderPlaylists(ids: string[]): Promise<void> {
  if (ids[0] !== FAVORITES_PLAYLIST_ID) {
    throw new Error('Favorites must be first in sort order');
  }
  const db = await getDB();
  const tx = db.transaction(STORE_PLAYLIST, 'readwrite');
  const store = tx.objectStore(STORE_PLAYLIST);

  for (let i = 0; i < ids.length; i++) {
    const playlist = await store.get(ids[i]);
    if (playlist) {
      playlist.sortOrder = i;
      playlist.updatedAt = Date.now();
      await store.put(playlist);
    }
  }
  await tx.done;
}

/** Replace playlist's entry order (client must supply full ordered entries). */
export async function setPlaylistEntryOrder(
  playlistId: string,
  entries: PlaylistEntry[],
): Promise<Playlist | null> {
  const db = await getDB();
  const playlist = await db.get(STORE_PLAYLIST, playlistId);
  if (!playlist) return null;

  playlist.entries = entries;
  playlist.updatedAt = Date.now();
  await db.put(STORE_PLAYLIST, playlist);
  return playlist;
}

/**
 * Add media to playlist (upsert entry: if exists set removed=false, else append).
 */
export async function addMediaToPlaylist(
  playlistId: string,
  mediaId: string,
): Promise<Playlist | null> {
  const db = await getDB();
  const playlist = await db.get(STORE_PLAYLIST, playlistId);
  if (!playlist) return null;

  const media = await getMedia(mediaId);
  const titleSnapshot = media?.title ?? '(未知媒体)';

  const existingIndex = playlist.entries.findIndex((e: PlaylistEntry) => e.mediaId === mediaId);
  if (existingIndex >= 0) {
    // Re-add: flip removed flag & refresh snapshot.
    playlist.entries[existingIndex].removed = false;
    playlist.entries[existingIndex].titleSnapshot = titleSnapshot;
  } else {
    // New entry.
    playlist.entries.push({ mediaId, removed: false, titleSnapshot });
  }

  playlist.updatedAt = Date.now();
  await db.put(STORE_PLAYLIST, playlist);
  return playlist;
}

/**
 * Remove media from playlist (soft: set removed=true).
 */
export async function removeMediaFromPlaylist(
  playlistId: string,
  mediaId: string,
): Promise<Playlist | null> {
  const db = await getDB();
  const playlist = await db.get(STORE_PLAYLIST, playlistId);
  if (!playlist) return null;

  const entry = playlist.entries.find((e: PlaylistEntry) => e.mediaId === mediaId);
  if (entry) {
    entry.removed = true;
  }

  playlist.updatedAt = Date.now();
  await db.put(STORE_PLAYLIST, playlist);
  return playlist;
}

/**
 * Toggle media in favorites playlist.
 */
export async function toggleFavorites(mediaId: string): Promise<boolean> {
  const db = await getDB();
  const favorites = await db.get(STORE_PLAYLIST, FAVORITES_PLAYLIST_ID);
  if (!favorites) {
    await ensureFavoritesPlaylist();
    return toggleFavorites(mediaId);
  }

  const entry = favorites.entries.find((e: PlaylistEntry) => e.mediaId === mediaId);
  if (entry) {
    entry.removed = !entry.removed;
  } else {
    const media = await getMedia(mediaId);
    favorites.entries.push({
      mediaId,
      removed: false,
      titleSnapshot: media?.title ?? '(未知媒体)',
    });
  }

  favorites.updatedAt = Date.now();
  await db.put(STORE_PLAYLIST, favorites);
  return entry ? !entry.removed : true;
}

/**
 * Check if media is in favorites (removed=false).
 */
export async function isMediaInFavorites(mediaId: string): Promise<boolean> {
  const favorites = await getPlaylist(FAVORITES_PLAYLIST_ID);
  if (!favorites) return false;
  const entry = favorites.entries.find((e) => e.mediaId === mediaId);
  return entry ? !entry.removed : false;
}

/**
 * Mark media as removed in all playlists (called on media delete).
 */
export async function markMediaRemovedInAllPlaylists(mediaId: string): Promise<void> {
  const db = await getDB();
  const playlists = await getPlaylistList();

  const tx = db.transaction(STORE_PLAYLIST, 'readwrite');
  const store = tx.objectStore(STORE_PLAYLIST);

  for (const playlist of playlists) {
    const entry = playlist.entries.find((e) => e.mediaId === mediaId);
    if (entry && !entry.removed) {
      entry.removed = true;
      playlist.updatedAt = Date.now();
      await store.put(playlist);
    }
  }

  await tx.done;
}
