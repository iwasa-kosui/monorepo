import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { AiAgentBotFollowupsHandledStore } from '../../../domain/aiAgentBot/aiAgentBotFollowup.ts';
import type { IoriD1Db } from '../client.ts';
import { runBatch } from '../runBatch.ts';
import { aiAgentBotFollowupsTable } from '../schema.ts';

/** フォローアップを処理したことを記録する。すでに記録してあるときは、最初の記録を残す */
export const createD1AiAgentBotFollowupsHandledStore = (db: IoriD1Db): AiAgentBotFollowupsHandledStore => ({
  store: async (...handled) => {
    await runBatch(
      db,
      handled.map((entry) =>
        db.update(aiAgentBotFollowupsTable)
          .set({ outcome: entry.outcome, reason: entry.reason, handledAt: new Date(entry.handledAt) })
          .where(and(
            eq(aiAgentBotFollowupsTable.followupId, entry.followupId),
            isNull(aiAgentBotFollowupsTable.handledAt),
          ))
      ),
    );
    return RA.ok(undefined);
  },
});
