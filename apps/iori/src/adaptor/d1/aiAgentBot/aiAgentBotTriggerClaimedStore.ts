import { RA } from '@iwasa-kosui/result';

import type { AiAgentBotTriggerClaimedStore } from '../../../domain/aiAgentBot/aiAgentBot.ts';
import type { IoriD1Db } from '../client.ts';
import { aiAgentBotTriggersTable } from '../schema.ts';

/**
 * トリガーに処理中の印を付ける。行がまだ無いときだけ入れ、入れられたら true を返す。
 * 重なって動いた cron のうち、1 つだけがトリガーに答えるようにする。
 */
export const createD1AiAgentBotTriggerClaimedStore = (db: IoriD1Db): AiAgentBotTriggerClaimedStore => ({
  store: async ({ postId, claimedAt }) => {
    const inserted = await db.insert(aiAgentBotTriggersTable).values({
      postId,
      outcome: 'claimed',
      reason: null,
      handledAt: new Date(claimedAt),
    }).onConflictDoNothing({ target: aiAgentBotTriggersTable.postId })
      .returning({ postId: aiAgentBotTriggersTable.postId });
    return RA.ok(inserted.length > 0);
  },
});
