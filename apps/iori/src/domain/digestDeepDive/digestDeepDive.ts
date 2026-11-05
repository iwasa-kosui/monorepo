import { err, ok, type RA, type Result } from '@iwasa-kosui/result';
import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { ArticleId } from '../article/articleId.ts';
import type { ArticleBodyWritten } from '../articleBody/articleBody.ts';
import { DigestItemId } from '../digest/digestItemId.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import { DigestDeepDiveId, DigestDeepDiveTurnId } from './digestDeepDiveId.ts';

export const DIGEST_DEEP_DIVE_MAX_TURNS = 10;
export const DIGEST_DEEP_DIVE_INSTRUCTION_MAX_CHARS = 200;

const instructionZodType = z.string().refine(
  (value) => Array.from(value).length <= DIGEST_DEEP_DIVE_INSTRUCTION_MAX_CHARS,
  { message: `instruction must be at most ${DIGEST_DEEP_DIVE_INSTRUCTION_MAX_CHARS} characters` },
);

const turnZodType = z.object({
  turnId: DigestDeepDiveTurnId.zodType,
  turnNumber: z.number().int().min(1).max(DIGEST_DEEP_DIVE_MAX_TURNS),
  instruction: instructionZodType,
  resultMarkdown: z.string().min(1),
  createdAt: Instant.zodType,
});
export type DigestDeepDiveTurn = z.output<typeof turnZodType>;

const zodType = z
  .object({
    deepDiveId: DigestDeepDiveId.zodType,
    userId: UserId.zodType,
    digestItemId: DigestItemId.zodType,
    articleId: ArticleId.zodType,
    turns: z.array(turnZodType).min(1).max(DIGEST_DEEP_DIVE_MAX_TURNS),
    createdAt: Instant.zodType,
    updatedAt: Instant.zodType,
  })
  .refine(
    (deepDive) => deepDive.turns.every((turn, index) => turn.turnNumber === index + 1),
    { message: 'turn numbers must be consecutive from 1' },
  )
  .describe('DigestDeepDive');
const schema = Schema.create<z.output<typeof zodType>, z.input<typeof zodType>>(zodType);
export type DigestDeepDive = z.output<typeof zodType>;
export type DigestDeepDiveParseError = Extract<ReturnType<typeof schema.parse>, { ok: false }>['err'];

export type DigestDeepDiveAggregateId = Readonly<{
  deepDiveId: DigestDeepDiveId;
}>;
export type DigestDeepDiveAggregate = Agg.Aggregate<DigestDeepDiveAggregateId, 'digestDeepDive', DigestDeepDive>;
const toAggregateId = (deepDive: Pick<DigestDeepDive, 'deepDiveId'>): DigestDeepDiveAggregateId => ({
  deepDiveId: deepDive.deepDiveId,
});

type DigestDeepDiveEvent<
  TAggregateState extends Agg.InferState<DigestDeepDiveAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<DigestDeepDiveAggregate, TAggregateState, TEventName, TEventPayload>;
const DigestDeepDiveEvent = AggregateEvent.createFactory<DigestDeepDiveAggregate>('digestDeepDive');

export type DigestDeepDiveStarted = DigestDeepDiveEvent<DigestDeepDive, 'digestDeepDive.started', DigestDeepDive>;
export type DigestDeepDiveTurnAdded = DigestDeepDiveEvent<
  DigestDeepDive,
  'digestDeepDive.turnAdded',
  { deepDiveId: DigestDeepDiveId; turn: DigestDeepDiveTurn }
>;

export type DigestDeepDiveTurnLimitError = Readonly<{
  type: 'DigestDeepDiveTurnLimitError';
  message: string;
  detail: { deepDiveId: DigestDeepDiveId };
}>;

export const DigestDeepDiveTurnLimitError = {
  create: (deepDiveId: DigestDeepDiveId): DigestDeepDiveTurnLimitError => ({
    type: 'DigestDeepDiveTurnLimitError',
    message: `A deep dive accepts at most ${DIGEST_DEEP_DIVE_MAX_TURNS} turns.`,
    detail: { deepDiveId },
  }),
} as const;

export type DigestDeepDiveConflictError = Readonly<{
  type: 'DigestDeepDiveConflictError';
  message: string;
  detail: { articleId: ArticleId };
}>;

export const DigestDeepDiveConflictError = {
  create: (articleId: ArticleId): DigestDeepDiveConflictError => ({
    type: 'DigestDeepDiveConflictError',
    message: '本文が更新されています。読み込み直してください',
    detail: { articleId },
  }),
} as const;

export type DigestItemNotInBodyError = Readonly<{
  type: 'DigestItemNotInBodyError';
  message: string;
  detail: { digestItemId: DigestItemId };
}>;

export const DigestItemNotInBodyError = {
  create: (digestItemId: DigestItemId): DigestItemNotInBodyError => ({
    type: 'DigestItemNotInBodyError',
    message: 'この項目が本文に見つかりません',
    detail: { digestItemId },
  }),
} as const;

export type StartDigestDeepDivePayload = Readonly<{
  userId: UserId;
  digestItemId: DigestItemId;
  articleId: ArticleId;
  instruction: string;
  resultMarkdown: string;
}>;

const start = (
  payload: StartDigestDeepDivePayload,
  now: Instant,
): Result<DigestDeepDiveStarted, DigestDeepDiveParseError> => {
  const parsed = schema.parse({
    deepDiveId: DigestDeepDiveId.generate(),
    userId: payload.userId,
    digestItemId: payload.digestItemId,
    articleId: payload.articleId,
    turns: [{
      turnId: DigestDeepDiveTurnId.generate(),
      turnNumber: 1,
      instruction: payload.instruction,
      resultMarkdown: payload.resultMarkdown,
      createdAt: now,
    }],
    createdAt: now,
    updatedAt: now,
  });
  if (!parsed.ok) return parsed;
  const deepDive = parsed.val;
  return {
    ...parsed,
    val: DigestDeepDiveEvent.create(toAggregateId(deepDive), deepDive, 'digestDeepDive.started', deepDive, now),
  };
};

const isTurnLimitReached = (deepDive: DigestDeepDive): boolean => deepDive.turns.length >= DIGEST_DEEP_DIVE_MAX_TURNS;

const addTurn = (
  deepDive: DigestDeepDive,
  payload: Readonly<{ instruction: string; resultMarkdown: string }>,
  now: Instant,
): Result<DigestDeepDiveTurnAdded, DigestDeepDiveTurnLimitError | DigestDeepDiveParseError> => {
  if (isTurnLimitReached(deepDive)) return err(DigestDeepDiveTurnLimitError.create(deepDive.deepDiveId));
  const turn: DigestDeepDiveTurn = {
    turnId: DigestDeepDiveTurnId.generate(),
    turnNumber: deepDive.turns.length + 1,
    instruction: payload.instruction,
    resultMarkdown: payload.resultMarkdown,
    createdAt: now,
  };
  const parsed = schema.parse({ ...deepDive, turns: [...deepDive.turns, turn], updatedAt: now });
  if (!parsed.ok) return parsed;
  return ok(DigestDeepDiveEvent.create(
    toAggregateId(parsed.val),
    parsed.val,
    'digestDeepDive.turnAdded',
    { deepDiveId: deepDive.deepDiveId, turn },
    now,
  ));
};

export type DigestDeepDiveResolverByDigestItemId = Agg.Resolver<DigestItemId, DigestDeepDive | undefined>;
export type DigestDeepDiveBodyWrittenStore = Readonly<{
  store: (
    deepDiveEvent: DigestDeepDiveStarted | DigestDeepDiveTurnAdded,
    bodyWritten: ArticleBodyWritten,
    baseUpdatedAt: Instant,
  ) => RA<{ written: boolean }, never>;
}>;

export const DigestDeepDive = {
  ...schema,
  instructionZodType,
  start,
  addTurn,
  isTurnLimitReached,
  toAggregateId,
} as const;
