import type { RA } from '@iwasa-kosui/result';

import type { ActorId } from '../actor/actorId.ts';
import type { RemoteActorType } from '../actor/remoteActor.ts';
import type { Instant } from '../instant/instant.ts';
import type { PostId } from '../post/postId.ts';
import type { UserId } from '../user/userId.ts';

/**
 * AI エージェントの bot のユーザー名。パスワードもパスキーも持たないので、誰もこのユーザーでログインできない。
 * bot の操作は、cron から Workers AI のエージェントが行う。
 */
export const AI_AGENT_BOT_USERNAME = 'iori';

export const AI_AGENT_BOT_PROFILE = {
  displayName: 'iori (AI)',
  bio: 'iori に住む AI エージェントの bot です。メンションや返信には、スレッドや URL の中身を調べて答えます。'
    + 'ときどき自分からも投稿します。発言はすべて AI が自動で生成しているので、誤りを含むことがあります。',
} as const;

/** 1 つのスレッドで bot が返信する上限。bot どうしや人との応酬が終わらないのを防ぐ */
export const MAX_BOT_REPLIES_PER_THREAD = 5;

/** 24 時間で bot が返信する上限。Workers AI の利用量を抑える */
export const MAX_BOT_REPLIES_PER_DAY = 50;

/** これより古いメンションや返信には答えない。止まっていた間に溜まったものへ遅れて答えるのを防ぐ */
export const BOT_TRIGGER_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const isAiAgentBotUsername = (username: string): boolean => username === AI_AGENT_BOT_USERNAME;

/** bot に返事を求める投稿（bot へのメンションか、bot の投稿への返信） */
export type AiAgentBotTrigger = Readonly<{
  postId: PostId;
  authorActorId: ActorId;
  receivedAt: Instant;
}>;

export type AiAgentBotTriggerOutcome = 'replied' | 'ignored' | 'failed';

export type AiAgentBotIgnoreReason = 'expired' | 'botAuthor' | 'threadLimit' | 'emptyAnswer';

/** トリガーを処理した記録。同じ投稿に 2 回答えないために残す */
export type AiAgentBotTriggerHandled = Readonly<{
  postId: PostId;
  outcome: AiAgentBotTriggerOutcome;
  reason: string | null;
  handledAt: Instant;
}>;

export type AiAgentBotResponseDecision =
  | Readonly<{ type: 'respond' }>
  | Readonly<{ type: 'ignore'; reason: Exclude<AiAgentBotIgnoreReason, 'emptyAnswer'> }>;

/**
 * トリガーに返信するかを決める。
 * - 古いトリガーには答えない
 * - 相手が bot（Service / Application）なら答えない。bot どうしの応酬を防ぐ
 * - 同じスレッドで上限まで返信していたら答えない
 */
const decideResponse = (
  input: Readonly<{
    trigger: AiAgentBotTrigger;
    authorActorType: RemoteActorType | undefined;
    botRepliesInThread: number;
    now: Instant;
  }>,
): AiAgentBotResponseDecision => {
  if (input.now - input.trigger.receivedAt > BOT_TRIGGER_EXPIRY_MS) return { type: 'ignore', reason: 'expired' };
  if (input.authorActorType === 'Service' || input.authorActorType === 'Application') {
    return { type: 'ignore', reason: 'botAuthor' };
  }
  if (input.botRepliesInThread >= MAX_BOT_REPLIES_PER_THREAD) return { type: 'ignore', reason: 'threadLimit' };
  return { type: 'respond' };
};

/** 何も言うことがないときにモデルが返す合図 */
export const AI_AGENT_BOT_SKIP_MARKER = 'SKIP';

/** 1 回の投稿に載せる文字数の上限（メンションを除く） */
export const MAX_BOT_POST_CHARACTERS = 480;

/**
 * モデルの答えを投稿できる本文に整える。何も言わないときは undefined を返す。
 * - 前後の空白と、全体を囲む引用符やコードフェンスを取り除く
 * - 先頭のメンション（@user や @user@host）を取り除く。メンションは iori が付け直す
 * - 上限を超えた分は切り詰めて「…」を付ける
 */
const normalizeAnswer = (raw: string): string | undefined => {
  let text = raw.trim();
  const fenced = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenced !== null) text = fenced[1]!.trim();
  if (text.length >= 2 && /^["「『]/.test(text) && /["」』]$/.test(text)) text = text.slice(1, -1).trim();
  text = text.replace(/^(?:@[\w.-]+(?:@[\w.-]+)?(?:\s+|$))+/, '').trim();
  if (text.length === 0 || text.toUpperCase() === AI_AGENT_BOT_SKIP_MARKER) return undefined;
  const chars = [...text];
  return chars.length > MAX_BOT_POST_CHARACTERS ? `${chars.slice(0, MAX_BOT_POST_CHARACTERS - 1).join('')}…` : text;
};

export const AiAgentBot = {
  username: AI_AGENT_BOT_USERNAME,
  profile: AI_AGENT_BOT_PROFILE,
  isBotUsername: isAiAgentBotUsername,
  decideResponse,
  normalizeAnswer,
} as const;

export type AiAgentBotPendingTriggersResolver = Readonly<{
  resolve: (condition: Readonly<{ botUserId: UserId; limit: number }>) => RA<readonly AiAgentBotTrigger[], never>;
}>;

export type AiAgentBotTriggersHandledStore = Readonly<{
  store: (...handled: readonly AiAgentBotTriggerHandled[]) => RA<void, never>;
}>;

export type AiAgentBotRepliedCountResolverSince = Readonly<{
  resolve: (since: Instant) => RA<number, never>;
}>;
