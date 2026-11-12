import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import type { PostId } from './postId.ts';

const optionZodType = z.object({
  title: z.string(),
  votesCount: z.number().int().nonnegative(),
});
const zodType = z.object({
  multiple: z.boolean(),
  options: z.array(optionZodType),
  votersCount: z.nullable(z.number().int().nonnegative()),
  expiresAt: z.nullable(Instant.zodType),
  closed: z.boolean(),
});
const schema = Schema.create(zodType);

export type RemotePostPollOption = z.infer<typeof optionZodType>;
export type RemotePostPoll = z.infer<typeof zodType>;

const isExpired = (poll: RemotePostPoll, now: Instant): boolean =>
  poll.closed || (poll.expiresAt !== null && poll.expiresAt <= now);

const totalVotes = (poll: RemotePostPoll): number => poll.options.reduce((sum, option) => sum + option.votesCount, 0);

export const RemotePostPoll = {
  ...schema,
  isExpired,
  totalVotes,
} as const;

export type RemotePostPollsResolverByPostIds = Agg.Resolver<
  ReadonlyArray<PostId>,
  ReadonlyMap<PostId, RemotePostPoll>
>;
