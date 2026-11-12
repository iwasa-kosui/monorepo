import { inArray } from 'drizzle-orm';

import type { LinkPreviewsDeletedStore } from '../../../domain/linkPreview/linkPreview.ts';
import type { IoriD1Db } from '../client.ts';
import { linkPreviewsTable } from '../schema.ts';

const IDS_PER_STATEMENT = 50;

export const createD1LinkPreviewsDeletedStore = (db: IoriD1Db): LinkPreviewsDeletedStore => ({
  store: async (linkPreviewIds) => {
    const deletes = [];
    for (let i = 0; i < linkPreviewIds.length; i += IDS_PER_STATEMENT) {
      deletes.push(
        db.delete(linkPreviewsTable).where(
          inArray(linkPreviewsTable.linkPreviewId, linkPreviewIds.slice(i, i + IDS_PER_STATEMENT)),
        ),
      );
    }
    const [first, ...rest] = deletes;
    if (first === undefined) return;
    await db.batch([first, ...rest]);
  },
});
