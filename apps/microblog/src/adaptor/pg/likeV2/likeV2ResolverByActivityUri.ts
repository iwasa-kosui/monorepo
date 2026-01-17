import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import type { LikeV2, LikeV2ResolverByActivityUri } from '../../../domain/like/likeV2.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { likesV2Table } from '../schema.ts';

const resolve = async ({ likeActivityUri }: { likeActivityUri: string }): RA<LikeV2 | undefined, never> => {
  const result = await DB.getInstance()
    .select()
    .from(likesV2Table)
    .where(eq(likesV2Table.likeActivityUri, likeActivityUri))
    .limit(1);

  if (result.length === 0) {
    return RA.ok(undefined);
  }

  const row = result[0];
  return RA.ok({
    likeId: LikeId.orThrow(row.likeId),
    actorId: ActorId.orThrow(row.actorId),
    objectUri: row.objectUri,
    likeActivityUri: row.likeActivityUri,
  });
};

const getInstance = singleton(
  (): LikeV2ResolverByActivityUri => ({
    resolve,
  }),
);

export const PgLikeV2ResolverByActivityUri = {
  getInstance,
} as const;
