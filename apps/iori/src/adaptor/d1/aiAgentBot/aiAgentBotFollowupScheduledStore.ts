import { RA } from '@iwasa-kosui/result';

import type { AiAgentBotFollowupScheduledStore } from '../../../domain/aiAgentBot/aiAgentBotFollowup.ts';
import type { IoriD1Db } from '../client.ts';
import { runBatch } from '../runBatch.ts';
import { aiAgentBotFollowupsTable } from '../schema.ts';

export const createD1AiAgentBotFollowupScheduledStore = (db: IoriD1Db): AiAgentBotFollowupScheduledStore => ({
  store: async (...followups) => {
    await runBatch(
      db,
      followups.map((followup) =>
        db.insert(aiAgentBotFollowupsTable).values({
          followupId: followup.followupId,
          postId: followup.postId,
          authorActorId: followup.authorActorId,
          note: followup.note,
          round: followup.round,
          dueAt: new Date(followup.dueAt),
          scheduledAt: new Date(followup.scheduledAt),
        })
      ),
    );
    return RA.ok(undefined);
  },
});
