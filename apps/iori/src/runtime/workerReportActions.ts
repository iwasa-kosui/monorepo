import type { Context } from '@fedify/fedify';
import { Flag } from '@fedify/vocab';
import { RA, type ResultAsync } from '@iwasa-kosui/result';

import type { ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { ActorId } from '../domain/actor/actorId.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { Report, ReportCategory, ReportSubmittedStore } from '../domain/report/report.ts';
import { Report as DomainReport } from '../domain/report/report.ts';
import type { UserResolver } from '../domain/user/user.ts';
import type { UserId } from '../domain/user/userId.ts';
import { resolveLocalActorWith, resolveUserWith } from '../useCase/helper/resolve.ts';

export type WorkerReportActionInput = Readonly<{
  userId: UserId;
  actorId: ActorId;
  statusIds: ReadonlyArray<PostId>;
  category: ReportCategory;
  comment: string;
  forward: boolean;
  ctx: Context<unknown>;
}>;

export type WorkerReportActionError = Readonly<{
  type:
    | 'ReporterNotFoundError'
    | 'TargetNotFoundError'
    | 'CannotReportSelfError'
    | 'CannotReportLocalActorError'
    | 'ReportedStatusNotFoundError'
    | 'InvalidReportError';
  message: string;
}>;

export type WorkerReportActionOk = Readonly<{ report: Report; submittedAt: Instant }>;

export type WorkerReportAction = (
  input: WorkerReportActionInput,
) => ResultAsync<WorkerReportActionOk, WorkerReportActionError>;

type WorkerReportActionDeps = Readonly<{
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  actorResolverById: ActorResolverById;
  postResolver: PostResolver;
  reportSubmittedStore: ReportSubmittedStore;
}>;

const categoryLabels: Readonly<Record<ReportCategory, string>> = {
  spam: 'スパム',
  offensive: '不快・攻撃的な内容',
  other: 'その他',
};

const toFlagContent = (category: ReportCategory, comment: string): string =>
  [categoryLabels[category], comment].filter((line) => line.trim() !== '').join('\n');

const failure = (type: WorkerReportActionError['type'], message: string) => RA.err({ type, message });

export const createWorkerReportAction = (deps: WorkerReportActionDeps): WorkerReportAction => async (input) => {
  const user = await resolveUserWith(deps.userResolver)(input.userId);
  if (!user.ok) return failure('ReporterNotFoundError', user.err.message);
  const reporter = await resolveLocalActorWith(deps.actorResolverByUserId)(input.userId);
  if (!reporter.ok) return failure('ReporterNotFoundError', reporter.err.message);
  const target = await deps.actorResolverById.resolve(input.actorId);
  if (!target.ok || target.val === undefined) {
    return failure('TargetNotFoundError', `Actor not found: ${input.actorId}`);
  }
  if (target.val.id === reporter.val.id) {
    return failure('CannotReportSelfError', 'The report cannot target your own account');
  }
  if (target.val.type !== 'remote') {
    return failure('CannotReportLocalActorError', 'The report is not supported for local accounts');
  }
  const submitted = DomainReport.submit({
    userId: input.userId,
    targetActorId: target.val.id,
    statusIds: [...new Set(input.statusIds)],
    category: input.category,
    comment: input.comment,
    forwarded: input.forward,
  }, Instant.now());
  if (!submitted.ok) return failure('InvalidReportError', submitted.err.message);
  const event = submitted.val;
  const posts = await Promise.all(event.eventPayload.statusIds.map((statusId) => deps.postResolver.resolve(statusId)));
  const statusUris: string[] = [];
  for (const post of posts) {
    if (!post.ok || post.val === undefined || post.val.type !== 'remote' || post.val.actorId !== target.val.id) {
      return failure('ReportedStatusNotFoundError', 'The reported statuses must be posts of the reported account');
    }
    statusUris.push(post.val.uri);
  }
  await deps.reportSubmittedStore.store(event);
  if (input.forward) {
    const reporterUri = input.ctx.getActorUri(user.val.username);
    await input.ctx.sendActivity(
      { username: user.val.username },
      { id: new URL(target.val.uri), inboxId: new URL(target.val.inboxUrl) },
      new Flag({
        id: new URL(`${reporterUri.href}#flags/${event.eventPayload.reportId}`),
        actor: reporterUri,
        objects: [new URL(target.val.uri), ...statusUris.map((uri) => new URL(uri))],
        content: toFlagContent(event.eventPayload.category, event.eventPayload.comment),
      }),
    );
  }
  return RA.ok({ report: event.eventPayload, submittedAt: event.occurredAt });
};
