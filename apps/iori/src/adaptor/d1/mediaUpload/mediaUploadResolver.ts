import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { MediaUpload, type MediaUploadResolver } from '../../../domain/mediaUpload/mediaUpload.ts';
import type { IoriD1Db } from '../client.ts';
import { mediaUploadsTable } from '../schema.ts';

export const createD1MediaUploadResolver = (db: IoriD1Db): MediaUploadResolver => ({
  resolve: async (mediaId) => {
    const [row] = await db.select().from(mediaUploadsTable).where(eq(mediaUploadsTable.mediaId, mediaId)).limit(1);
    return RA.ok(
      row === undefined ? undefined : MediaUpload.parseOrThrow({ ...row, createdAt: row.createdAt.getTime() }),
    );
  },
});
