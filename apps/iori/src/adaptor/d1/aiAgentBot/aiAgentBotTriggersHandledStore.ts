import { RA } from '@iwasa-kosui/result';

import type { AiAgentBotTriggersHandledStore } from '../../../domain/aiAgentBot/aiAgentBot.ts';
import type { IoriD1Db } from '../client.ts';
import { runBatch } from '../runBatch.ts';
import { aiAgentBotTriggersTable } from '../schema.ts';

/** 処理したトリガーを記録する。同じ投稿を 2 回記録しようとしたときは、最初の記録を残す */
export const createD1AiAgentBotTriggersHandledStore = (db: IoriD1Db): AiAgentBotTriggersHandledStore => ({
  store: async (...handled) => {
    await runBatch(
      db,
      handled.map((entry) =>
        db.insert(aiAgentBotTriggersTable).values({
          postId: entry.postId,
          outcome: entry.outcome,
          reason: entry.reason,
          handledAt: new Date(entry.handledAt),
        }).onConflictDoNothing({ target: aiAgentBotTriggersTable.postId })
      ),
    );
    return RA.ok(undefined);
  },
});
