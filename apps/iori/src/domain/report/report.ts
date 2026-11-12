import { Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import { PostId } from '../post/postId.ts';
import { UserId } from '../user/userId.ts';
import { ReportId } from './reportId.ts';

export const MAX_REPORT_COMMENT_LENGTH = 1000;
export const MAX_REPORT_STATUS_COUNT = 20;

const categoryZodType = z.enum(['spam', 'offensive', 'other']).describe('ReportCategory');
export type ReportCategory = z.output<typeof categoryZodType>;
export const ReportCategory = Schema.create<ReportCategory, string>(categoryZodType);

const zodType = z
  .object({
    reportId: ReportId.zodType,
    userId: UserId.zodType,
    targetActorId: ActorId.zodType,
    statusIds: z.array(PostId.zodType).max(MAX_REPORT_STATUS_COUNT),
    category: categoryZodType,
    comment: z.string().max(MAX_REPORT_COMMENT_LENGTH),
    forwarded: z.boolean(),
  })
  .describe('Report');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type Report = z.output<typeof zodType>;

export type ReportRecord = Pick<Report, 'reportId' | 'userId' | 'targetActorId'>;
export type ReportAggregateId = Readonly<{
  reportId: ReportId;
}>;
export type ReportAggregate = Agg.Aggregate<ReportAggregateId, 'report', ReportRecord>;
const toAggregateId = (report: Pick<Report, 'reportId'>): ReportAggregateId => ({
  reportId: report.reportId,
});

type ReportEvent<
  TAggregateState extends Agg.InferState<ReportAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<ReportAggregate, TAggregateState, TEventName, TEventPayload>;
const ReportEvent = AggregateEvent.createFactory<ReportAggregate>('report');

export type ReportSubmitted = ReportEvent<ReportRecord, 'report.reportSubmitted', Report>;

export type InvalidReportError = Readonly<{
  type: 'InvalidReportError';
  message: string;
}>;

export const InvalidReportError = {
  create: (message: string): InvalidReportError => ({ type: 'InvalidReportError', message }),
} as const;

const submit = (
  input: Omit<Report, 'reportId'>,
  now: Instant,
): Result<ReportSubmitted, InvalidReportError> => {
  const parsed = schema.of({ ...input, reportId: ReportId.generate() });
  if (!parsed.ok) return Result.err(InvalidReportError.create(parsed.err.message));
  const report = parsed.val;
  return Result.ok(ReportEvent.create(
    toAggregateId(report),
    { reportId: report.reportId, userId: report.userId, targetActorId: report.targetActorId },
    'report.reportSubmitted',
    report,
    now,
  ));
};

export type ReportSubmittedStore = Agg.Store<ReportSubmitted>;

export const Report = {
  ...schema,
  submit,
  toAggregateId,
} as const;
