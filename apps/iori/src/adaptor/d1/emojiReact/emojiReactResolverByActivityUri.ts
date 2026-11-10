import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { EmojiReact, type EmojiReactResolverByActivityUri } from '../../../domain/emojiReact/emojiReact.ts';
import type { IoriD1Db } from '../client.ts';
import { emojiReactsTable } from '../schema.ts';

export const createD1EmojiReactResolverByActivityUri = (db: IoriD1Db): EmojiReactResolverByActivityUri => ({
  resolve: async ({ emojiReactActivityUri }) => {
    const [row] = await db.select().from(emojiReactsTable).where(
      eq(emojiReactsTable.emojiReactActivityUri, emojiReactActivityUri),
    ).limit(1);
    return RA.ok(row === undefined ? undefined : EmojiReact.orThrow(row));
  },
});
