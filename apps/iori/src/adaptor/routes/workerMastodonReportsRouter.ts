import type { Context as FedifyContext } from '@fedify/fedify';
import { Hono } from 'hono';

import { ActorId } from '../../domain/actor/actorId.ts';
import { Scope } from '../../domain/oauth/scope.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { ReportCategory } from '../../domain/report/report.ts';
import type { WorkerReportAction } from '../../runtime/workerReportActions.ts';
import type { Report } from '../mastodon/entities.ts';
import type { StatusAssembler } from '../mastodon/statusAssembler.ts';
import { toIsoString } from '../mastodon/time.ts';
import { actorNotFound, handleInternalError, internalServerError } from './helper/mastodonErrors.ts';
import { bodyString, bodyStringList, readRequestBody } from './helper/requestBody.ts';
import { getMastodonPrincipal, type MastodonAuthEnv, type MastodonAuthn } from './mastodonAuthn.ts';

export type WorkerMastodonReportsRouterDeps = Readonly<{
  authn: MastodonAuthn;
  statusAssembler: StatusAssembler;
  reportRemoteActor: WorkerReportAction;
  createContext: (request: Request) => FedifyContext<unknown>;
}>;

const invalidToken = { error: 'The access token is invalid' } as const;
const recordNotFound = { error: 'Record not found' } as const;
const writeReports = Scope.orThrow('write:reports');
const validationFailed = (message: string) => ({ error: `Validation failed: ${message}` });

const categories: Readonly<Record<Report['category'], ReportCategory>> = {
  spam: 'spam',
  violation: 'offensive',
  other: 'other',
};
const mastodonCategories: Readonly<Record<ReportCategory, Report['category']>> = {
  spam: 'spam',
  offensive: 'violation',
  other: 'other',
};

const parseCategory = (value: string | undefined): ReportCategory | undefined => {
  if (value === undefined || value === '') return 'other';
  return Object.hasOwn(categories, value) ? categories[value as Report['category']] : undefined;
};

export const createWorkerMastodonReportsRouter = ({
  authn,
  statusAssembler,
  reportRemoteActor,
  createContext,
}: WorkerMastodonReportsRouterDeps): Hono<MastodonAuthEnv> =>
  new Hono<MastodonAuthEnv>()
    .onError(handleInternalError)
    .post('/v1/reports', authn.requireUser(writeReports), async (c) => {
      const userId = getMastodonPrincipal(c)?.userId;
      if (userId === null || userId === undefined) {
        return c.json(invalidToken, 401);
      }
      const body = await readRequestBody(c);
      const accountId = bodyString(body, 'account_id');
      if (accountId === undefined || accountId === '') {
        return c.json(validationFailed('Account can\'t be blank'), 422);
      }
      const actorId = ActorId.parse(accountId);
      if (!actorId.ok) {
        return c.json(recordNotFound, 404);
      }
      const category = parseCategory(bodyString(body, 'category'));
      if (category === undefined) {
        return c.json(validationFailed('Category is not included in the list'), 422);
      }
      const statusIds = bodyStringList(body, 'status_ids[]', 'status_ids').filter((id) => id !== '').map((id) =>
        PostId.parse(id)
      );
      const invalidStatus = statusIds.find((id) => !id.ok);
      if (invalidStatus !== undefined) {
        return c.json(validationFailed('Status is not found'), 422);
      }
      const reported = await reportRemoteActor({
        userId,
        actorId: actorId.val,
        statusIds: statusIds.flatMap((id) => id.ok ? [id.val] : []),
        category,
        comment: bodyString(body, 'comment') ?? '',
        ctx: createContext(c.req.raw),
      });
      if (!reported.ok) {
        switch (reported.err.type) {
          case 'TargetNotFoundError':
            return c.json(recordNotFound, 404);
          case 'ReporterNotFoundError':
            return c.json(actorNotFound, 422);
          default:
            return c.json(validationFailed(reported.err.message), 422);
        }
      }
      const [account] = await statusAssembler.assembleAccounts({
        actorIds: [reported.val.report.targetActorId],
        requestUrl: c.req.url,
      });
      if (account === undefined) {
        return c.json(internalServerError, 500);
      }
      const report: Report = {
        id: reported.val.report.reportId,
        action_taken: false,
        action_taken_at: null,
        category: mastodonCategories[reported.val.report.category],
        comment: reported.val.report.comment,
        forwarded: true,
        created_at: toIsoString(reported.val.submittedAt),
        status_ids: [...reported.val.report.statusIds],
        rule_ids: null,
        target_account: account,
      };
      return c.json(report);
    });
