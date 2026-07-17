import type { AppDatabase } from './schema.js';
import { STORE_RECORDING, STORE_SUBTITLE } from './schema.js';
import { assignSegmentIds, buildSegmentIdMigrationMap } from '../lib/segment-id.js';
import type { PracticeRecord, SubtitleTrack } from '../types/models.js';

function looksLikeLegacySegmentId(id: string): boolean {
  // Legacy ids were crypto.randomUUID(); deterministic ids are 64-char hex.
  return id.includes('-') || id.length !== 64;
}

/**
 * Reassign deterministic segment ids for all subtitle tracks and update
 * recording references. Safe to run outside upgrade (uses a fresh transaction).
 */
export async function migrateSegmentIdsToDeterministic(db: AppDatabase): Promise<void> {
  const tracks = (await db.getAll(STORE_SUBTITLE)) as SubtitleTrack[];
  const needsMigration = tracks.some((track) =>
    track.segments.some((segment) => looksLikeLegacySegmentId(segment.id)),
  );
  if (!needsMigration) {
    return;
  }

  const idMapsByMedia = new Map<string, Map<string, string>>();
  const nextTracks: SubtitleTrack[] = [];

  for (const track of tracks) {
    const migrationMap = await buildSegmentIdMigrationMap(track.mediaId, track.segments);
    idMapsByMedia.set(track.mediaId, migrationMap);
    nextTracks.push({
      ...track,
      segments: await assignSegmentIds(track.mediaId, track.segments),
    });
  }

  const records = (await db.getAll(STORE_RECORDING)) as PracticeRecord[];
  const nextRecords: PracticeRecord[] = [];

  for (const record of records) {
    const idMap = idMapsByMedia.get(record.mediaId);
    if (!idMap) {
      continue;
    }

    let changed = false;
    let nextSegmentId = record.segmentId;
    if (record.segmentId) {
      const mapped = idMap.get(record.segmentId);
      if (mapped && mapped !== record.segmentId) {
        nextSegmentId = mapped;
        changed = true;
      }
    }

    const nextSegments = record.segments.map((segment) => {
      const mapped = idMap.get(segment.id);
      if (mapped && mapped !== segment.id) {
        changed = true;
        return { ...segment, id: mapped };
      }
      return segment;
    });

    if (changed) {
      nextRecords.push({
        ...record,
        segmentId: nextSegmentId,
        segments: nextSegments,
      });
    }
  }

  const tx = db.transaction([STORE_SUBTITLE, STORE_RECORDING], 'readwrite');
  for (const track of nextTracks) {
    await tx.objectStore(STORE_SUBTITLE).put(track);
  }
  for (const record of nextRecords) {
    await tx.objectStore(STORE_RECORDING).put(record);
  }
  await tx.done;
}
