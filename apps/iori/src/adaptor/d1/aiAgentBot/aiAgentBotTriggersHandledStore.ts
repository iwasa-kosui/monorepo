import { RA } from '@iwasa-kosui/result';

import type { AiAgentBotTriggersHandledStore } from '../../../domain/aiAgentBot/aiAgentBot.ts';
import type { IoriD1Db } from '../client.ts';
import { runBatch } from '../runBatch.ts';
import { aiAgentBotTriggersTable } from '../schema.ts';

/** 処理したトリガーの結果を記録する。処理中の印が付いていれば、結果で上書きする */
export const createD1AiAgentBotTriggersHandledStore = (db: IoriD1Db): AiAgentBotTriggersHandledStore => ({
  store: async (...handled) => {
    await runBatch(
      db,
      handled.map((entry) => {
        const values = { outcome: entry.outcome, reason: entry.reason, handledAt: new Date(entry.handledAt) };
        return db.insert(aiAgentBotTriggersTable).values({ postId: entry.postId, ...values })
          .onConflictDoUpdate({ target: aiAgentBotTriggersTable.postId, set: values });
      }),
    );
    return RA.ok(undefined);
  },
});
