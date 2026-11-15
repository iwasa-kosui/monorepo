import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { AiAgentBotFollowupClaimedStore } from '../../../domain/aiAgentBot/aiAgentBotFollowup.ts';
import type { IoriD1Db } from '../client.ts';
import { aiAgentBotFollowupsTable } from '../schema.ts';

/**
 * フォローアップに処理中の印を付ける。まだ印が無いときだけ付け、付けられたら true を返す。
 * 重なって動いた cron のうち、1 つだけが予定を処理するようにする。
 */
export const createD1AiAgentBotFollowupClaimedStore = (db: IoriD1Db): AiAgentBotFollowupClaimedStore => ({
  store: async ({ followupId, claimedAt }) => {
    const claimed = await db.update(aiAgentBotFollowupsTable)
      .set({ claimedAt: new Date(claimedAt) })
      .where(and(eq(aiAgentBotFollowupsTable.followupId, followupId), isNull(aiAgentBotFollowupsTable.claimedAt)))
      .returning({ followupId: aiAgentBotFollowupsTable.followupId });
    return RA.ok(claimed.length > 0);
  },
});
