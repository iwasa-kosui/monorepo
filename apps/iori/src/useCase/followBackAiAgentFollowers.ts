import { RA, type Result } from '@iwasa-kosui/result';

import type { ActorId } from '../domain/actor/actorId.ts';
import {
  type AiAgentBotFollowBackAttemptedStore,
  type AiAgentBotFollowBackCandidatesResolver,
  FOLLOW_BACK_RETRY_INTERVAL_MS,
  MAX_FOLLOW_BACKS_PER_RUN,
} from '../domain/aiAgentBot/aiAgentBotFollowBack.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { UseCase } from './useCase.ts';

/** bot として相手をフォローする。runtime がフォローのユースケースを包んで用意する */
export type AiAgentBotFollower = Readonly<{
  follow: (actorId: ActorId) => Promise<Result<void, string>>;
}>;

type Input = Readonly<{ botActorId: ActorId; follower: AiAgentBotFollower }>;

type Ok = Readonly<{ followed: number; failed: number }>;

export type FollowBackAiAgentFollowersUseCase = UseCase<Input, Ok, never>;

type Deps = Readonly<{
  candidatesResolver: AiAgentBotFollowBackCandidatesResolver;
  attemptedStore: AiAgentBotFollowBackAttemptedStore;
  now: () => Instant;
}>;

/**
 * bot をフォローしてくれた人に、フォローを返す。
 * 成功しても失敗しても試した記録を残し、同じ人へは間隔をあけてからでないと送り直さない。
 * 失敗した相手に毎分送り続けたり、断られた相手に何度も申請したりしないため。
 */
const create = (deps: Deps): FollowBackAiAgentFollowersUseCase => ({
  run: async ({ botActorId, follower }) => {
    const now = deps.now();
    const candidates = await deps.candidatesResolver.resolve({
      botActorId,
      retryBefore: Instant.addDuration(now, -FOLLOW_BACK_RETRY_INTERVAL_MS),
      limit: MAX_FOLLOW_BACKS_PER_RUN,
    });
    let followed = 0;
    let failed = 0;
    for (const actorId of candidates.val) {
      const result = await follower.follow(actorId);
      if (result.ok) followed++;
      else {
        failed++;
        console.warn('iori ai agent bot: follow-back failed.', { actorId, error: result.err });
      }
      await deps.attemptedStore.store({ actorId, attemptedAt: now });
    }
    return RA.ok({ followed, failed });
  },
});

export const FollowBackAiAgentFollowersUseCase = { create } as const;
