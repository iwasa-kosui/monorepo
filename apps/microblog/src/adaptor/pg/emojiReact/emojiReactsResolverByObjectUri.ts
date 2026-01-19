import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { EmojiReact, EmojiReactsResolverByObjectUri } from '../../../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../../../domain/emojiReact/emojiReactId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { emojiReactsTable } from '../schema.ts';

const resolve = async ({ objectUri }: { objectUri: string }): RA<ReadonlyArray<EmojiReact>, never> => {
  const results = await DB.getInstance()
    .select()
    .from(emojiReactsTable)
    .where(eq(emojiReactsTable.objectUri, objectUri));

  return RA.ok(results.map(row => ({
    emojiReactId: EmojiReactId.orThrow(row.emojiReactId),
    actorId: row.actorId as ActorId,
    objectUri: row.objectUri,
    emoji: row.emoji,
    emojiReactActivityUri: row.emojiReactActivityUri,
    emojiImageUrl: row.emojiImageUrl,
  })));
};

const getInstance = singleton(
  (): EmojiReactsResolverByObjectUri => ({
    resolve,
  }),
);

export const PgEmojiReactsResolverByObjectUri = {
  getInstance,
} as const;
