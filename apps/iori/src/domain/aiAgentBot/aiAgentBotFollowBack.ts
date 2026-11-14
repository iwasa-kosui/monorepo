import type { RA } from '@iwasa-kosui/result';

import type { ActorId } from '../actor/actorId.ts';
import type { Instant } from '../instant/instant.ts';

/** 1 回の実行でフォローを返す人数の上限。フォローの配送が一度に増えすぎないようにする */
export const MAX_FOLLOW_BACKS_PER_RUN = 10;

/**
 * フォローを返したのにまだフォローしていない相手に、もう一度フォローを返すまでの間隔。
 * 鍵のかかったアカウントに断られたときなどに、毎分送り続けないようにする
 */
export const FOLLOW_BACK_RETRY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** bot をフォローしてくれた人にフォローを返そうとした記録 */
export type AiAgentBotFollowBackAttempted = Readonly<{
  actorId: ActorId;
  attemptedAt: Instant;
}>;

/**
 * フォローを返す相手を選ぶ。bot をフォローしていて、bot はまだフォローしておらず、
 * retryBefore より後にフォローを返そうとしていない人を、古いフォロワーから順に返す
 */
export type AiAgentBotFollowBackCandidatesResolver = Readonly<{
  resolve: (
    condition: Readonly<{ botActorId: ActorId; retryBefore: Instant; limit: number }>,
  ) => RA<readonly ActorId[], never>;
}>;

export type AiAgentBotFollowBackAttemptedStore = Readonly<{
  store: (...attempted: readonly AiAgentBotFollowBackAttempted[]) => RA<void, never>;
}>;
