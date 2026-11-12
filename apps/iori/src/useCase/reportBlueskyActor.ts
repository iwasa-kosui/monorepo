import { RA } from '@iwasa-kosui/result';

import {
  type BlueskyModerationValidationError,
  type BlueskyReportCategory,
  BlueskyReportComment,
  blueskyReportReasonType,
} from '../domain/blueskyModeration/blueskyModeration.ts';
import type { BlueskyClient, BlueskyClientError } from '../ports/blueskyClient.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  did: string;
  category: BlueskyReportCategory;
  comment: string;
  post?: Readonly<{ uri: string; cid: string }>;
}>;

type Ok = Readonly<{ reported: true }>;

type Err = BlueskyClientError | BlueskyModerationValidationError;

export type ReportBlueskyActorUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  client: Pick<BlueskyClient, 'createReport'>;
}>;

const create = ({ client }: Deps): ReportBlueskyActorUseCase => {
  const run = async ({ did, category, comment, post }: Input): RA<Ok, Err> => {
    const reason = BlueskyReportComment.parse(comment);
    if (!reason.ok) return RA.err({ type: 'BlueskyModerationValidationError', field: 'comment' });
    const reported = await client.createReport({
      subjectDid: did,
      reasonType: blueskyReportReasonType(category),
      reason: reason.val,
      ...(post === undefined ? {} : { subjectPost: post }),
    });
    return reported.ok ? RA.ok({ reported: true }) : RA.err(reported.err);
  };

  return { run };
};

export const ReportBlueskyActorUseCase = {
  create,
} as const;
