import { RA } from '@iwasa-kosui/result';
import { inArray, sql } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { DirectMessageActorsResolverByUris } from '../../../domain/fediverseConversation/fediverseConversation.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { actorsTable } from '../schema.ts';

export const createD1DirectMessageActorsResolverByUris = (db: IoriD1Db): DirectMessageActorsResolverByUris => ({
  resolve: async (uris) => {
    if (uris.length === 0) return RA.ok(new Map());
    const rows = await db.select({
      actorId: actorsTable.actorId,
      uri: actorsTable.uri,
      inboxUrl: actorsTable.inboxUrl,
      type: actorsTable.type,
    })
      .from(actorsTable)
      .where(inArray(actorsTable.uri, sql`(select value from json_each(${idsJson([...new Set(uris)])}))`));
    return RA.ok(
      new Map(rows.map((row) => [row.uri, {
        actorId: ActorId.orThrow(row.actorId),
        uri: row.uri,
        inboxUrl: row.inboxUrl,
        type: row.type === 'local' ? 'local' : 'remote',
      }])),
    );
  },
});
