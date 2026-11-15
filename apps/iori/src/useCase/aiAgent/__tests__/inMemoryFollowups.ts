import { RA } from '@iwasa-kosui/result';

import type { AiAgentBotFollowup } from '../../../domain/aiAgentBot/aiAgentBotFollowup.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { FollowupSchedulerDeps } from '../followupScheduler.ts';

/** フォローアップの予定をメモリに保存する。テストで、入った予定を読み返すのに使う */
export const createInMemoryFollowups = (now: () => Instant, pendingAlready = 0) => {
  const scheduled: AiAgentBotFollowup[] = [];
  const deps: FollowupSchedulerDeps = {
    followupScheduledStore: {
      store: (...followups) => {
        scheduled.push(...followups);
        return RA.ok(undefined);
      },
    },
    pendingFollowupsCountResolver: { resolve: () => RA.ok(pendingAlready + scheduled.length) },
    now,
  };
  return { deps, scheduled };
};
