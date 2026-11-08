import { BlueskyCrosspost } from '../../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { blueskyCrosspostsTable } from '../schema.ts';

export const toBlueskyCrosspost = (row: typeof blueskyCrosspostsTable.$inferSelect): BlueskyCrosspost =>
  BlueskyCrosspost.orThrow({
    postId: row.postId as BlueskyCrosspost['postId'],
    status: row.status as BlueskyCrosspost['status'],
    skipReason: row.skipReason as BlueskyCrosspost['skipReason'],
    uri: row.uri,
    cid: row.cid,
    rkey: row.rkey,
    rootUri: row.rootUri,
    rootCid: row.rootCid,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt.getTime() as BlueskyCrosspost['createdAt'],
    updatedAt: row.updatedAt.getTime() as BlueskyCrosspost['updatedAt'],
  });
