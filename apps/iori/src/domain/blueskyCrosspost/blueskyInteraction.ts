import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';

export const BLUESKY_THREADGATE_COLLECTION = 'app.bsky.feed.threadgate';
export const BLUESKY_POSTGATE_COLLECTION = 'app.bsky.feed.postgate';

const replyAudienceZodType = z.enum(['mention', 'following', 'followers']);
export type BlueskyReplyAudience = z.infer<typeof replyAudienceZodType>;
export const BlueskyReplyAudience = {
  ...Schema.create(replyAudienceZodType),
  values: replyAudienceZodType.options,
} as const;

const replyRestrictionZodType = z.union([
  z.literal('everyone'),
  z.array(replyAudienceZodType).transform((audiences): BlueskyReplyAudience[] =>
    replyAudienceZodType.options.filter((audience) => audiences.includes(audience))
  ),
]);
export type BlueskyReplyRestriction = 'everyone' | readonly BlueskyReplyAudience[];
export const BlueskyReplyRestriction = Schema.create(replyRestrictionZodType);

const interactionZodType = z.object({
  replyRestriction: replyRestrictionZodType,
  quoteDisabled: z.boolean(),
});
export type BlueskyInteraction = Readonly<{
  replyRestriction: BlueskyReplyRestriction;
  quoteDisabled: boolean;
}>;

const defaultInteraction: BlueskyInteraction = { replyRestriction: 'everyone', quoteDisabled: false };

export const BlueskyInteraction = {
  ...Schema.create(interactionZodType),
  default: defaultInteraction,
  isDefault: (interaction: BlueskyInteraction): boolean =>
    interaction.replyRestriction === 'everyone' && !interaction.quoteDisabled,
} as const;

type ThreadgateRuleType =
  | 'app.bsky.feed.threadgate#mentionRule'
  | 'app.bsky.feed.threadgate#followingRule'
  | 'app.bsky.feed.threadgate#followerRule';

export type BlueskyThreadgateRule = Readonly<{ $type: ThreadgateRuleType }>;

export type BlueskyThreadgateRecord = Readonly<{
  $type: typeof BLUESKY_THREADGATE_COLLECTION;
  post: string;
  allow: readonly BlueskyThreadgateRule[];
  createdAt: string;
}>;

export type BlueskyPostgateRecord = Readonly<{
  $type: typeof BLUESKY_POSTGATE_COLLECTION;
  post: string;
  embeddingRules: readonly [Readonly<{ $type: 'app.bsky.feed.postgate#disableRule' }>];
  createdAt: string;
}>;

const ruleTypeOf: Readonly<Record<BlueskyReplyAudience, ThreadgateRuleType>> = {
  mention: 'app.bsky.feed.threadgate#mentionRule',
  following: 'app.bsky.feed.threadgate#followingRule',
  followers: 'app.bsky.feed.threadgate#followerRule',
};

export const blueskyPostUriOf = (input: Readonly<{ did: string; rkey: string }>): string =>
  `at://${input.did}/app.bsky.feed.post/${input.rkey}`;

export const blueskyThreadgateRecordOf = (
  input: Readonly<{ post: string; replyRestriction: BlueskyReplyRestriction; createdAt: string }>,
): BlueskyThreadgateRecord | undefined =>
  input.replyRestriction === 'everyone' ? undefined : {
    $type: BLUESKY_THREADGATE_COLLECTION,
    post: input.post,
    allow: input.replyRestriction.map((audience) => ({ $type: ruleTypeOf[audience] })),
    createdAt: input.createdAt,
  };

export const blueskyPostgateRecordOf = (
  input: Readonly<{ post: string; quoteDisabled: boolean; createdAt: string }>,
): BlueskyPostgateRecord | undefined =>
  input.quoteDisabled
    ? {
      $type: BLUESKY_POSTGATE_COLLECTION,
      post: input.post,
      embeddingRules: [{ $type: 'app.bsky.feed.postgate#disableRule' }],
      createdAt: input.createdAt,
    }
    : undefined;
