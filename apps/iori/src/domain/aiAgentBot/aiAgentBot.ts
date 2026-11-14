import type { RA } from '@iwasa-kosui/result';

import type { ActorId } from '../actor/actorId.ts';
import type { RemoteActorType } from '../actor/remoteActor.ts';
import type { Instant } from '../instant/instant.ts';
import type { PostId } from '../post/postId.ts';
import type { UserId } from '../user/userId.ts';

/**
 * AI エージェントの bot のユーザー名。パスワードもパスキーも持たないので、誰もこのユーザーでログインできない。
 * bot の操作は、cron から Workers AI のエージェントが行う。
 *
 * `agent` は GitHub のユーザー名としても使える。GitHub の PR やコミットメッセージで bot のハンドルを書くときは、
 * 同名の GitHub アカウントの持ち主へメンションの通知が飛ばないよう、必ずバッククォートで囲む。
 */
export const AI_AGENT_BOT_USERNAME = 'agent';

/**
 * 以前の bot のユーザー名。アカウントは消さずに残し、もう動かさない。
 * 残ったアカウントが人のアカウントに見えないよう、bot であることは示し続ける。
 */
export const RETIRED_AI_AGENT_BOT_USERNAMES: readonly string[] = ['iori_bot'];

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

/** bot のアカウントかを判定する。以前の bot のアカウントも含む */
export const isAiAgentBotUsername = (username: string): boolean =>
  username === AI_AGENT_BOT_USERNAME || RETIRED_AI_AGENT_BOT_USERNAMES.includes(username);

/** bot に返事を求める投稿（bot へのメンションか、bot の投稿への返信） */
export type AiAgentBotTrigger = Readonly<{
  postId: PostId;
  authorActorId: ActorId;
  receivedAt: Instant;
}>;

export type AiAgentBotTriggerOutcome = 'replied' | 'ignored' | 'failed';

/**
 * トリガーを処理し始めた印。答える前に記録して、ほかの実行が同じトリガーに答えないようにする。
 * cron は 1 分ごとに動き、1 回の実行が 1 分を超えると次の実行と重なるため。
 */
export type AiAgentBotTriggerClaimed = Readonly<{
  postId: PostId;
  claimedAt: Instant;
}>;

export type AiAgentBotIgnoreReason = 'expired' | 'selfAuthor' | 'botAuthor' | 'threadLimit' | 'emptyAnswer';

/** トリガーを処理した記録 */
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
 * - 自分の投稿には答えない。自分の返信に自分で答え続けるのを防ぐ
 * - 相手が bot（Service / Application）なら答えない。bot どうしの応酬を防ぐ
 * - 同じスレッドで上限まで返信していたら答えない
 */
const decideResponse = (
  input: Readonly<{
    trigger: AiAgentBotTrigger;
    botActorId: ActorId;
    authorActorType: RemoteActorType | undefined;
    botRepliesInThread: number;
    now: Instant;
  }>,
): AiAgentBotResponseDecision => {
  if (input.now - input.trigger.receivedAt > BOT_TRIGGER_EXPIRY_MS) return { type: 'ignore', reason: 'expired' };
  if (input.trigger.authorActorId === input.botActorId) return { type: 'ignore', reason: 'selfAuthor' };
  if (input.authorActorType === 'Service' || input.authorActorType === 'Application') {
    return { type: 'ignore', reason: 'botAuthor' };
  }
  if (input.botRepliesInThread >= MAX_BOT_REPLIES_PER_THREAD) return { type: 'ignore', reason: 'threadLimit' };
  return { type: 'respond' };
};

/** 何も言うことがないときにモデルが返す合図 */
export const AI_AGENT_BOT_SKIP_MARKER = 'SKIP';

/** 自分の最近の投稿とこれ以上似ていたら、同じ投稿の繰り返しとみなす（文字 bigram の Dice 係数） */
export const BOT_REPEAT_SIMILARITY_THRESHOLD = 0.8;

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

/** 比べるために、空白・記号を除き、全角半角と大文字小文字をそろえる */
const comparableText = (text: string): string => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

const bigrams = (text: string): Map<string, number> => {
  const chars = [...text];
  const counts = new Map<string, number>();
  for (let i = 0; i < chars.length - 1; i++) {
    const gram = `${chars[i]}${chars[i + 1]}`;
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
};

const similarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const gramsA = bigrams(a);
  const gramsB = bigrams(b);
  const total = [...gramsA.values(), ...gramsB.values()].reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;
  let shared = 0;
  for (const [gram, n] of gramsA) shared += Math.min(n, gramsB.get(gram) ?? 0);
  return (2 * shared) / total;
};

/**
 * これから投稿する本文が、自分の最近の投稿の繰り返しかを判定する。
 * モデルはタイムラインにある自分の投稿をなぞって、同じ内容を何度も書くことがあるため。
 */
const isRepeatOf = (text: string, recentTexts: readonly string[]): boolean => {
  const target = comparableText(text);
  if (target.length === 0) return false;
  return recentTexts.some((recent) => similarity(target, comparableText(recent)) >= BOT_REPEAT_SIMILARITY_THRESHOLD);
};

export const AiAgentBot = {
  username: AI_AGENT_BOT_USERNAME,
  profile: AI_AGENT_BOT_PROFILE,
  isBotUsername: isAiAgentBotUsername,
  decideResponse,
  normalizeAnswer,
  isRepeatOf,
} as const;

export type AiAgentBotPendingTriggersResolver = Readonly<{
  resolve: (condition: Readonly<{ botUserId: UserId; limit: number }>) => RA<readonly AiAgentBotTrigger[], never>;
}>;

/** トリガーを処理し始めた印を付ける。すでに印が付いていたら（ほかの実行が処理中か処理済みなら）false を返す */
export type AiAgentBotTriggerClaimedStore = Readonly<{
  store: (claimed: AiAgentBotTriggerClaimed) => RA<boolean, never>;
}>;

/** 処理の結果を記録する。印を付けたトリガーの記録を結果で上書きする */
export type AiAgentBotTriggersHandledStore = Readonly<{
  store: (...handled: readonly AiAgentBotTriggerHandled[]) => RA<void, never>;
}>;

export type AiAgentBotRepliedCountResolverSince = Readonly<{
  resolve: (since: Instant) => RA<number, never>;
}>;
