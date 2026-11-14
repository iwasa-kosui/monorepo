import { type RA, Result } from '@iwasa-kosui/result';
import { z } from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { ActorId } from '../actor/actorId.ts';
import { Instant } from '../instant/instant.ts';
import type { PostId } from '../post/postId.ts';
import { type AiAgentBotIgnoreReason, BOT_TRIGGER_EXPIRY_MS, MAX_BOT_REPLIES_PER_THREAD } from './aiAgentBot.ts';

const AiAgentBotFollowupIdSym = Symbol('AiAgentBotFollowupId');
const zodType = z.uuid().brand(AiAgentBotFollowupIdSym).describe('AiAgentBotFollowupId');
export type AiAgentBotFollowupId = z.output<typeof zodType>;

const idSchema = Schema.create<AiAgentBotFollowupId, string>(zodType);

export const AiAgentBotFollowupId = {
  ...idSchema,
  generate: (): AiAgentBotFollowupId => idSchema.orThrow(crypto.randomUUID()),
} as const;

/** 続きを調べるまでに空けられる時間の下限と上限（分） */
export const MIN_FOLLOWUP_DELAY_MINUTES = 10;
export const MAX_FOLLOWUP_DELAY_MINUTES = 7 * 24 * 60;

/** フォローアップのメモに書ける文字数の上限 */
export const MAX_FOLLOWUP_NOTE_CHARACTERS = 500;

/**
 * 1 つの話題でフォローアップを重ねられる回数。
 * メンションから入れた予定が 1 回目で、フォローアップの中でさらに入れるたびに 1 つ増える。
 */
export const MAX_FOLLOWUP_ROUNDS = 3;

/** まだ処理していないフォローアップの上限。予定が溜まり続けるのを防ぐ */
export const MAX_PENDING_FOLLOWUPS = 50;

/**
 * bot が「あとで続きを調べる」と決めた予定。
 * dueAt を過ぎたら、bot がメモとスレッドを読み直して続きを調べ、postId の投稿に続報を返信する。
 */
export type AiAgentBotFollowup = Readonly<{
  followupId: AiAgentBotFollowupId;
  /** 続報を返信する投稿（もとのメンションや返信） */
  postId: PostId;
  /** postId の投稿者。続報でメンションする相手 */
  authorActorId: ActorId;
  /** 予定を入れたときの bot 自身のメモ。何を調べるつもりだったか */
  note: string;
  round: number;
  dueAt: Instant;
  scheduledAt: Instant;
}>;

export type AiAgentBotFollowupScheduleError =
  | Readonly<{ type: 'emptyNote' }>
  | Readonly<{ type: 'invalidDelay' }>
  | Readonly<{ type: 'roundLimit' }>;

/**
 * フォローアップの予定を作る。
 * メモは前後の空白を除き、上限を超えた分は切り詰める。待ち時間は下限と上限の範囲に限る。
 */
const schedule = (
  input: Readonly<{
    postId: PostId;
    authorActorId: ActorId;
    note: string;
    delayMinutes: number;
    round: number;
    now: Instant;
  }>,
): Result<AiAgentBotFollowup, AiAgentBotFollowupScheduleError> => {
  const note = [...input.note.trim()].slice(0, MAX_FOLLOWUP_NOTE_CHARACTERS).join('');
  if (note.length === 0) return Result.err({ type: 'emptyNote' });
  if (
    !Number.isInteger(input.delayMinutes)
    || input.delayMinutes < MIN_FOLLOWUP_DELAY_MINUTES
    || input.delayMinutes > MAX_FOLLOWUP_DELAY_MINUTES
  ) {
    return Result.err({ type: 'invalidDelay' });
  }
  if (input.round < 1 || input.round > MAX_FOLLOWUP_ROUNDS) return Result.err({ type: 'roundLimit' });
  return Result.ok({
    followupId: AiAgentBotFollowupId.generate(),
    postId: input.postId,
    authorActorId: input.authorActorId,
    note,
    round: input.round,
    dueAt: Instant.addDuration(input.now, input.delayMinutes * 60 * 1000),
    scheduledAt: input.now,
  });
};

export type AiAgentBotFollowupDecision =
  | Readonly<{ type: 'followUp' }>
  | Readonly<{ type: 'ignore'; reason: Extract<AiAgentBotIgnoreReason, 'expired' | 'threadLimit'> }>;

/**
 * 期日を迎えたフォローアップを実行するかを決める。
 * - 期日から長く過ぎたもの（cron が止まっていた間に溜まったもの）は実行しない
 * - 同じスレッドで上限まで返信していたら実行しない
 */
const decide = (
  input: Readonly<{ followup: AiAgentBotFollowup; botRepliesInThread: number; now: Instant }>,
): AiAgentBotFollowupDecision => {
  if (input.now - input.followup.dueAt > BOT_TRIGGER_EXPIRY_MS) return { type: 'ignore', reason: 'expired' };
  if (input.botRepliesInThread >= MAX_BOT_REPLIES_PER_THREAD) return { type: 'ignore', reason: 'threadLimit' };
  return { type: 'followUp' };
};

export const AiAgentBotFollowup = { schedule, decide } as const;

export type AiAgentBotFollowupOutcome = 'replied' | 'ignored' | 'failed';

/** フォローアップを処理した記録。同じ予定を 2 回実行しないために残す */
export type AiAgentBotFollowupHandled = Readonly<{
  followupId: AiAgentBotFollowupId;
  outcome: AiAgentBotFollowupOutcome;
  reason: string | null;
  handledAt: Instant;
}>;

export type AiAgentBotFollowupScheduledStore = Readonly<{
  store: (...followups: readonly AiAgentBotFollowup[]) => RA<void, never>;
}>;

/**
 * フォローアップを処理し始めた印を付ける。すでに印が付いていたら（ほかの実行が処理中か処理済みなら）false を返す。
 * cron は 1 分ごとに動き、1 回の実行が 1 分を超えると次の実行と重なるため。
 */
export type AiAgentBotFollowupClaimedStore = Readonly<{
  store: (claimed: Readonly<{ followupId: AiAgentBotFollowupId; claimedAt: Instant }>) => RA<boolean, never>;
}>;

/** 期日を迎えて、まだ誰も処理し始めていないフォローアップを、期日の古い順に返す */
export type AiAgentBotDueFollowupsResolver = Readonly<{
  resolve: (condition: Readonly<{ now: Instant; limit: number }>) => RA<readonly AiAgentBotFollowup[], never>;
}>;

/** まだ処理していないフォローアップの数 */
export type AiAgentBotPendingFollowupsCountResolver = Readonly<{
  resolve: (condition: Readonly<Record<never, never>>) => RA<number, never>;
}>;

export type AiAgentBotFollowupsHandledStore = Readonly<{
  store: (...handled: readonly AiAgentBotFollowupHandled[]) => RA<void, never>;
}>;
