import type { RequestContext } from '@fedify/fedify';
import { Result } from '@iwasa-kosui/result';

import type { LocalActor } from '../domain/actor/localActor.ts';
import { AiAgentBot } from '../domain/aiAgentBot/aiAgentBot.ts';
import type { DigestDmSender } from '../domain/digest/digest.ts';
import { plainTextToHtml } from '../domain/post/plainTextToHtml.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { User } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { WorkerRuntimePorts } from './ports.ts';

type Bot = Readonly<{ user: User; actor: LocalActor }>;

const withOwnerMention = async (
  runtime: WorkerRuntimePorts,
  ctx: RequestContext<unknown>,
  ownerUserId: UserId,
  html: string,
): Promise<Result<string, string>> => {
  const owner = await runtime.mastodon.userResolver.resolve(ownerUserId);
  if (!owner.ok || owner.val === undefined) return Result.err('所有者のユーザーが見つかりません');
  const actorUri = ctx.getActorUri(owner.val.username);
  const acct = `${owner.val.username}@${actorUri.host}`;
  return Result.ok(`${plainTextToHtml(`@${acct}`, new Map([[acct, actorUri.href]]))}${html}`);
};

export const createDigestDmSender = (
  runtime: WorkerRuntimePorts,
  bot: Bot,
  context: Readonly<{ request: Request; ctx: RequestContext<unknown> }>,
): DigestDmSender => ({
  sendSummary: async ({ ownerUserId, html }) => {
    const content = await withOwnerMention(runtime, context.ctx, ownerUserId, html);
    if (!content.ok) return Result.err(content.err);
    const created = await runtime.posting.createPostUseCase.run({
      userId: bot.user.id,
      content: content.val,
      visibility: AiAgentBot.digestVisibility,
      summary: null,
      sensitive: false,
      images: [],
      crosspostToBluesky: false,
      ctx: context.ctx,
    });
    return created.ok ? Result.ok(created.val.post.postId) : Result.err(created.err.message);
  },
  sendReply: async ({ ownerUserId, parentPostId, html }) => {
    const content = await withOwnerMention(runtime, context.ctx, ownerUserId, html);
    if (!content.ok) return Result.err(content.err);
    const sent = await runtime.core.sendReplyUseCase.run({
      userId: bot.user.id,
      postId: parentPostId,
      content: content.val,
      visibility: AiAgentBot.digestVisibility,
      summary: null,
      sensitive: false,
      images: [],
      crosspostToBluesky: false,
      notifyMentions: false,
      request: context.request,
      ctx: context.ctx,
    });
    return sent.ok ? Result.ok(sent.val.post.postId) : Result.err(sent.err.message);
  },
});

export const createDigestPostDeleter = (
  runtime: WorkerRuntimePorts,
  bot: Bot,
  context: Readonly<{ ctx: RequestContext<unknown> }>,
) =>
async (postId: PostId): Promise<Result<void, string>> => {
  const deleted = await runtime.core.deletePostUseCase.run({ userId: bot.user.id, postId, ctx: context.ctx });
  if (deleted.ok || deleted.err.type === 'PostNotFoundError') return Result.ok(undefined);
  return Result.err(deleted.err.message);
};
