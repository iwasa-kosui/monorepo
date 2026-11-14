import { Result } from '@iwasa-kosui/result';

import type { ActorId } from '../../domain/actor/actorId.ts';
import {
  AiAgentBotFollowup,
  type AiAgentBotFollowupScheduledStore,
  type AiAgentBotFollowupScheduleError,
  type AiAgentBotPendingFollowupsCountResolver,
  MAX_FOLLOWUP_DELAY_MINUTES,
  MAX_FOLLOWUP_ROUNDS,
  MAX_PENDING_FOLLOWUPS,
  MIN_FOLLOWUP_DELAY_MINUTES,
} from '../../domain/aiAgentBot/aiAgentBotFollowup.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { AgentTool } from './agentLoop.ts';
import { createFollowupTool } from './agentTools.ts';

export type FollowupSchedulerDeps = Readonly<{
  followupScheduledStore: AiAgentBotFollowupScheduledStore;
  pendingFollowupsCountResolver: AiAgentBotPendingFollowupsCountResolver;
  now: () => Instant;
}>;

const scheduleErrorMessage = (error: AiAgentBotFollowupScheduleError): string => {
  switch (error.type) {
    case 'emptyNote':
      return 'メモが空です。';
    case 'invalidDelay':
      return `afterMinutes は ${MIN_FOLLOWUP_DELAY_MINUTES} 以上 ${MAX_FOLLOWUP_DELAY_MINUTES} 以下の整数にしてください。`;
    case 'roundLimit':
      return `この話題では、これ以上予定を入れられません（${MAX_FOLLOWUP_ROUNDS} 回まで）。`;
  }
};

/**
 * postId の投稿について、あとで続きを調べる予定を入れるツールを作る。
 * round が上限を超えていたら、ツールを渡さない（空の一覧を返す）。
 */
export const createFollowupTools = (
  deps: FollowupSchedulerDeps,
  target: Readonly<{ postId: PostId; authorActorId: ActorId; round: number }>,
): readonly AgentTool[] => {
  if (target.round > MAX_FOLLOWUP_ROUNDS) return [];
  return [createFollowupTool(async ({ note, delayMinutes }) => {
    const pending = (await deps.pendingFollowupsCountResolver.resolve({})).val;
    if (pending >= MAX_PENDING_FOLLOWUPS) return Result.err('予定が多すぎるため、いまは入れられません。');
    const followup = AiAgentBotFollowup.schedule({ ...target, note, delayMinutes, now: deps.now() });
    if (!followup.ok) return Result.err(scheduleErrorMessage(followup.err));
    await deps.followupScheduledStore.store(followup.val);
    return Result.ok(new Date(followup.val.dueAt));
  })];
};
