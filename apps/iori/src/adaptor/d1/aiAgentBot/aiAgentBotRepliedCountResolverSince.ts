import { RA } from '@iwasa-kosui/result';
import { and, count, eq, gte } from 'drizzle-orm';

import type { AiAgentBotRepliedCountResolverSince } from '../../../domain/aiAgentBot/aiAgentBot.ts';
import type { IoriD1Db } from '../client.ts';
import { aiAgentBotTriggersTable } from '../schema.ts';

export const createD1AiAgentBotRepliedCountResolverSince = (db: IoriD1Db): AiAgentBotRepliedCountResolverSince => ({
  resolve: async (since) => {
    const [row] = await db.select({ n: count() }).from(aiAgentBotTriggersTable)
      .where(and(
        eq(aiAgentBotTriggersTable.outcome, 'replied'),
        gte(aiAgentBotTriggersTable.handledAt, new Date(since)),
      ));
    return RA.ok(row?.n ?? 0);
  },
});
