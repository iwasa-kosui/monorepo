import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { EmojiReact, EmojiReactResolverByActivityUri } from '../../../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { emojiReactsTable } from '../schema.ts';

const resolve = async (
  { emojiReactActivityUri }: { emojiReactActivityUri: string },
): RA<EmojiReact | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(emojiReactsTable)
    .where(eq(emojiReactsTable.emojiReactActivityUri, emojiReactActivityUri))
    .limit(1);

  if (result.length === 0) {
    return RA.ok(undefined);
  }

  const row = result[0];
  return RA.ok({
    emojiReactId: EmojiReactId.orThrow(row.emojiReactId),
    actorId: ActorId.orThrow(row.actorId),
    objectUri: row.objectUri,
    emoji: row.emoji,
    emojiReactActivityUri: row.emojiReactActivityUri,
  });
};

const getInstance = singleton(
  (): EmojiReactResolverByActivityUri => ({
    resolve,
  }),
);

export const PgEmojiReactResolverByActivityUri = {
  getInstance,
} as const;
