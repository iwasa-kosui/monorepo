import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { ActorId } from '../domain/actor/actorId.ts';
import type { AiAgentBotFollowBackAttempted } from '../domain/aiAgentBot/aiAgentBotFollowBack.ts';
import { Instant } from '../domain/instant/instant.ts';
import { FollowBackAiAgentFollowersUseCase } from './followBackAiAgentFollowers.ts';

describe('FollowBackAiAgentFollowersUseCase', () => {
  it('フォローに失敗した相手にも試した記録を残し、毎回送り直さない', async () => {
    const ok = ActorId.generate();
    const ng = ActorId.generate();
    const attempted: AiAgentBotFollowBackAttempted[] = [];
    const now = Instant.orThrow(1_000);
    const useCase = FollowBackAiAgentFollowersUseCase.create({
      candidatesResolver: {
        resolve: async () => RA.ok([ok, ng].filter((id) => !attempted.some((entry) => entry.actorId === id))),
      },
      attemptedStore: {
        store: async (...entries) => {
          attempted.push(...entries);
          return RA.ok(undefined);
        },
      },
      now: () => now,
    });
    const follower = {
      follow: async (actorId: ActorId) => actorId === ok ? Result.ok(undefined) : Result.err('rejected'),
    };

    const first = await useCase.run({ botActorId: ActorId.generate(), follower });
    const second = await useCase.run({ botActorId: ActorId.generate(), follower });

    expect(first.val).toEqual({ followed: 1, failed: 1 });
    expect(second.val).toEqual({ followed: 0, failed: 0 });
    expect(attempted).toEqual([{ actorId: ok, attemptedAt: now }, { actorId: ng, attemptedAt: now }]);
  });
});
