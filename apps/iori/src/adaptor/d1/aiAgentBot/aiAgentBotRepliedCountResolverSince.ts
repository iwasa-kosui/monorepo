import { RA } from '@iwasa-kosui/result';
import { and, count, eq, gte } from 'drizzle-orm';

import type { AiAgentBotRepliedCountResolverSince } from '../../../domain/aiAgentBot/aiAgentBot.ts';
import type { IoriD1Db } from '../client.ts';
import { aiAgentBotFollowupsTable, aiAgentBotTriggersTable } from '../schema.ts';

/** since 以降に返信したトリガーとフォローアップの数 */
export const createD1AiAgentBotRepliedCountResolverSince = (db: IoriD1Db): AiAgentBotRepliedCountResolverSince => ({
  resolve: async (since) => {
    const [[triggers], [followups]] = await Promise.all([
      db.select({ n: count() }).from(aiAgentBotTriggersTable)
        .where(and(
          eq(aiAgentBotTriggersTable.outcome, 'replied'),
          gte(aiAgentBotTriggersTable.handledAt, new Date(since)),
        )),
      db.select({ n: count() }).from(aiAgentBotFollowupsTable)
        .where(and(
          eq(aiAgentBotFollowupsTable.outcome, 'replied'),
          gte(aiAgentBotFollowupsTable.handledAt, new Date(since)),
        )),
    ]);
    return RA.ok((triggers?.n ?? 0) + (followups?.n ?? 0));
  },
});
